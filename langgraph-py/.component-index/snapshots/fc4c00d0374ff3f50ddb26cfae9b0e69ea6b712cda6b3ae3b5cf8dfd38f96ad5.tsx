import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as jssdk from '@meetyou/toolbox/lib/jssdk';
import Button, { ButtonProps } from '@meetyou/react-components/lib/button';
import Drawer, { DrawerProps } from '@meetyou/react-components/lib/drawer';
import Toast from '@meetyou/react-components/lib/toast';
import SafeAreaBottom from '@meetyou/react-components/lib/safe-area-bottom';
import { LOADING_ICON } from '@meetyou/react-components/lib/_images/base64';
import useBI, { Action } from '@meetyou/react-hooks/lib/useBI';
import classNames from 'classnames';
import { fetchProductDetail, requestOrder, verifyOrder } from '../../utils/service';
import { pay } from '../../utils/meetyou';
import { PAY_CHANNEL, PayChannelItem, ProductDetail } from '../../types';

const ICON_NAME = {
    [PAY_CHANNEL.ALIPAY]: 'icon_alipay',
    [PAY_CHANNEL.WECHAT]: 'icon_wechatpay',
};

enum PAY_RESULT {
    SUCCESS = 1,
    FAIL = 2,
}

const VERIFY_COUNT = 5; // 需要校验的次数

export interface PaymentPopupProps {
    /** 外层样式名 */
    className?: string;
    /** 自定义样式名前缀 */
    prefixClass?: string;
    /** 商品详情 */
    productData?: ProductDetail;
    /** 商品key */
    productKey: string;
    /** 场景key */
    sceneKey: string;
    /** 是否显示 */
    visible?: boolean;
    /** 弹窗标题 */
    title?: string;
    /** 查询支付状态的时间间隔 */
    intervalTime?: number;
    /** 查询支付状态的次数 */
    intervalCount?: number;
    /** 埋点事件event */
    event?: string;
    /** 组件是否自动上报埋点 */
    autoReportBi?: boolean;
    /** 显示状态改变时回调 */
    onVisibleChange?: (v: boolean) => void;
    /** 点击关闭按钮的回调 */
    onCancel?: () => void;
    /** 支付方式选项改变的回调 */
    onPaymentChange?: (type: any) => void;
    /** 支付按钮点击额外方法 */
    onButtonClick?: () => void;
    /** 支付成功的回调 */
    onPaySuccess?: () => void;
    /** 支付失败的回调 */
    onPayFail?: () => void;
    /** 自定义按钮，参考 https://static.seeyouyima.com/meetyou-react-packages/index.html#/react-components/general/button */
    buttonProps?: ButtonProps;
    /** Drawer 组件的 Props */
    drawerProps?: Partial<DrawerProps>;
}
export default function PaymentPopup({
    className,
    prefixClass = 'my-payment-popup',
    productData,
    productKey,
    sceneKey,
    visible,
    title = '订单确认',
    intervalTime = 2000,
    intervalCount = VERIFY_COUNT,
    event = 'dy_dxgmjh_ddzftc', // 订阅_单项购买计划_订单支付弹窗
    autoReportBi = true,
    onVisibleChange,
    onCancel,
    onPaymentChange,
    buttonProps = {},
    onButtonClick,
    onPaySuccess,
    onPayFail,
    drawerProps,
}: PaymentPopupProps) {
    const [open, setOpen] = useState(false);
    const [checkedType, setCheckedType] = useState(PAY_CHANNEL.ALIPAY);
    const [loading, setLoading] = useState(false);
    const [productDetail, setProductDetail] = useState<ProductDetail>(); // 商品详情
    const tradeNo = useRef(); // 交易单号
    const verifyCount = useRef(0); // 支付校验次数
    const verifyInterval = useRef<number | null>(null); // 轮询定时器
    const hasFinalResult = useRef(false); // 是否是支付最终状态
    const resultLoadingRef = useRef<{ destroy: () => void } | null>(null);
    const payLockRef = useRef(false); // pay 锁

    const { reportBI } = useBI();

    const onDrawerVisibleChange = useCallback(
        v => {
            setOpen(v);
            onVisibleChange?.(v);
        },
        [onVisibleChange],
    );

    /** 初始化处理支付弹窗的商品信息 */
    const initProductDetail = useCallback((data: ProductDetail) => {
        setProductDetail(data);
        const defaultPayChannel = data?.pay_channels?.find(
            (item: PayChannelItem) => item.is_default,
        )?.type;
        if (defaultPayChannel) {
            setCheckedType(defaultPayChannel);
        }
    }, []);

    /** 获取支付弹窗的商品信息 */
    const getPaymentInfo = useCallback(() => {
        // 有传入商品详情不再请求接口
        if (productData) {
            initProductDetail(productData);
            setOpen(true);
            return;
        }
        const { destroy } = Toast.loading({
            content: '',
            isActionable: false,
            style: { padding: 14 },
        });
        fetchProductDetail(productKey)
            .then(res => {
                if (res.code === 0) {
                    initProductDetail(res.data);
                    setOpen(true);
                } else {
                    throw res;
                }
            })
            .catch(error => {
                const { message } = (error ?? {}) as Error;
                jssdk.showToast(message ?? '获取商品详情失败');
                onDrawerVisibleChange(false);
            })
            .finally(() => {
                destroy();
            });
    }, [productKey, onDrawerVisibleChange, productData, initProductDetail]);

    /** 埋点上报 */
    const onReportBI = useCallback(
        (action: Action) => {
            if (!autoReportBi) return;
            reportBI({
                action,
                event,
                payload: {
                    info_key: productKey,
                    public_type: sceneKey,
                },
            });
        },
        [autoReportBi, reportBI, event, productKey, sceneKey],
    );

    useEffect(() => {
        if (!visible) return;
        getPaymentInfo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    useEffect(() => {
        if (!open) return;
        onReportBI(Action.曝光);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /** 支付完成后(成功、失败)的操作 */
    const afterPay = useCallback(
        (status: PAY_RESULT) => {
            setLoading(false);
            if (visible) {
                onDrawerVisibleChange(false);
            }

            if (!hasFinalResult.current) return;
            /** 以下操作在获取到支付最终结果后才需要执行 */

            console.log('完成支付校验');
            // 清空支付弹窗商品信息、交易单号
            setProductDetail(undefined);
            tradeNo.current = undefined;
            hasFinalResult.current = false;
            verifyCount.current = 0;

            if (resultLoadingRef.current) {
                resultLoadingRef.current.destroy();
                resultLoadingRef.current = null;
            }

            // 客户端支付协议的回调会调用 pollOrderStatus，如果是支付成功，第一次 checkOrderStatus 时就会初始化以上数据，导致定时器无法被清除，在这里做一次清除
            if (verifyInterval.current) {
                console.log('清除轮询定时器');
                clearInterval(verifyInterval.current);
                verifyInterval.current = null;
            }

            if (status === PAY_RESULT.SUCCESS) {
                jssdk.showToast('购买成功');
                onPaySuccess?.();
            } else {
                jssdk.showToast('购买失败，请稍后重试');
                onPayFail?.();
            }
        },
        [visible, onDrawerVisibleChange, onPaySuccess, onPayFail],
    );

    /* 校验订单状态 */
    const checkOrderStatus = useCallback(() => {
        if (document.visibilityState === 'hidden') return;

        if (!tradeNo.current || !productDetail) return;

        // 吐司之前需要把弹窗关掉
        if (visible) {
            onDrawerVisibleChange(false);
        }

        if (!resultLoadingRef.current) {
            const { destroy } = Toast.loading({
                content: '',
                isActionable: false,
                style: { padding: 14 },
            });
            resultLoadingRef.current = { destroy };
        }

        // 页面切回来后校验订单状态
        verifyCount.current += 1;
        console.log(`支付校验第${verifyCount.current}次`);
        verifyOrder({
            trade_no: tradeNo.current,
            product_key: productDetail?.product_key,
            pay_channel: checkedType,
            amount: productDetail?.price,
        })
            ?.then(verifyRes => {
                if (verifyRes.code === 0 && verifyRes.data.success) {
                    hasFinalResult.current = true;

                    afterPay(PAY_RESULT.SUCCESS);
                } else {
                    // jssdk.showToast(verifyRes.message ?? '购买失败，请稍后重试');
                    afterPay(PAY_RESULT.FAIL);
                }
            })
            .catch(() => {
                afterPay(PAY_RESULT.FAIL);
            });
    }, [productDetail, checkedType, afterPay, visible, onDrawerVisibleChange]);

    // 2s 一次，最多5次，查询支付结果
    const pollOrderStatus = useCallback(() => {
        if (verifyInterval.current) return;
        console.log('开启轮询定时器');
        verifyInterval.current = setInterval(() => {
            if (
                verifyInterval.current &&
                (verifyCount.current >= intervalCount || hasFinalResult.current)
            ) {
                console.log('清除轮询定时器');
                clearInterval(verifyInterval.current);
                if (verifyCount.current >= intervalCount && !hasFinalResult.current) {
                    // 校验次数用完还没获取到支付的最终结果
                    hasFinalResult.current = true;
                    afterPay(PAY_RESULT.FAIL);
                }
                return;
            }
            checkOrderStatus();
        }, intervalTime) as unknown as number;
    }, [checkOrderStatus, intervalTime, intervalCount, afterPay]);

    useEffect(() => {
        return () => (verifyInterval.current ? clearInterval(verifyInterval.current) : undefined);
    }, []);

    /** 点击立即支付按钮 */
    const onOkClick = useCallback(async () => {
        // 判断登录
        const userInfo = await jssdk.getUserInfo();
        if (!userInfo.hasLogin) {
            jssdk.openLogin({ closepage: 0, noreload: 1 });
            onDrawerVisibleChange(false);
            return;
        }
        if (loading || !productDetail) return;
        if (payLockRef.current) return;
        payLockRef.current = true;
        setLoading(true);
        onReportBI(Action.点击跳转);
        onButtonClick?.();
        requestOrder({
            product_id: productDetail?.id,
            product_key: productDetail?.product_key,
            pay_channel: checkedType,
            price: productDetail?.price,
            scene_key: sceneKey,
        })
            .then(async res => {
                payLockRef.current = false;
                if (res.code === 0) {
                    if (res.data?.sign) {
                        console.log('调用客户端支付协议');
                        tradeNo.current = res.data.trade_no;

                        // 以前的注释：这一步如果是切 APP 回来，客户端回调不到，这步会停住走不下去，需要到下面 pageShow 校验
                        // 更新注释：但是现在测试发现 ios APP 切回来不会停在这步，也会继续往下走这校验
                        const payRes = await pay(checkedType, res.data.sign);

                        // 安卓会在APP内唤起支付宝页面，所以支付完成直接走这一步，不会走 pageShow 校验
                        // ios 需要跳转支付宝，支付完成再回到APP内，此时会先走 pageShow 校验，这一步的校验就需要判断不再走下去
                        if (verifyCount.current > 0) {
                            return;
                        }

                        console.log('客户端支付协议完成，返回：', payRes);
                        if (payRes?.errorCode === -2) {
                            // 用户取消支付
                            hasFinalResult.current = true;
                            afterPay(PAY_RESULT.FAIL);
                        } else if (payRes?.errorCode !== -3) {
                            console.log('调用服务端接口，检验支付状态');
                            checkOrderStatus();
                            pollOrderStatus();
                        } else {
                            jssdk.showToast(
                                '请安装' + (checkedType === PAY_CHANNEL.WECHAT ? '微信' : '支付宝'),
                            );
                            afterPay(PAY_RESULT.FAIL);
                        }
                    }
                } else {
                    afterPay(PAY_RESULT.FAIL);
                    jssdk.showToast(res.message ?? '购买失败，请稍后重试');
                }
            })
            .catch(error => {
                payLockRef.current = false;

                afterPay(PAY_RESULT.FAIL);
                jssdk.showToast(error?.message ?? '购买失败，请稍后重试');
            });
    }, [
        loading,
        onReportBI,
        onButtonClick,
        checkedType,
        productDetail,
        sceneKey,
        checkOrderStatus,
        pollOrderStatus,
        afterPay,
        onDrawerVisibleChange,
    ]);

    useEffect(() => {
        const onVisibilitychange = () => {
            console.log('pageshow ~ 状态：', document.visibilityState);

            if (document.visibilityState === 'hidden') return;

            if (!tradeNo.current || !productDetail) return;

            checkOrderStatus();
            pollOrderStatus();
        };

        document.addEventListener('visibilitychange', onVisibilitychange);

        return () => document.removeEventListener('visibilitychange', onVisibilitychange);
    }, [checkOrderStatus, pollOrderStatus, productDetail]);

    /** 点击右上角关闭图标 */
    const onClose = useCallback(() => {
        onDrawerVisibleChange(false);
        onCancel?.();
    }, [onDrawerVisibleChange, onCancel]);

    /** 点击支付方式选项 */
    const onPaymentItemClick = useCallback(
        type => {
            if (type === checkedType) return;
            setCheckedType(type);
            onPaymentChange?.(type);
        },
        [checkedType, onPaymentChange],
    );

    return (
        <Drawer
            visible={open}
            onVisibleChange={onDrawerVisibleChange}
            duration={250}
            {...drawerProps}
        >
            <div className={classNames([`${prefixClass}__wrapper`, className])}>
                <img
                    className={`${prefixClass}__close`}
                    src='http://static.seeyouyima.com/webviewjs/images/icon_close.png'
                    onClick={onClose}
                />
                <div className={`${prefixClass}__title`}>{title}</div>
                <div className={`${prefixClass}__price`}>
                    <div className={`${prefixClass}__price__symbol`}>¥</div>
                    <div className={`${prefixClass}__price__num`}>
                        {productDetail?.price ? (productDetail?.price / 100).toFixed(2) : 0}
                    </div>
                </div>
                <div className={`${prefixClass}__subtitle`}>{productDetail?.name}</div>
                <div className={`${prefixClass}__method`}>
                    <div className={`${prefixClass}__method__title`}>支付方式</div>
                    <div className={`${prefixClass}__method__content`}>
                        {productDetail?.pay_channels?.map(item => {
                            return (
                                <div
                                    key={item.type}
                                    className={`${prefixClass}__method__item`}
                                    onClick={() => onPaymentItemClick(item.type)}
                                >
                                    <img
                                        className={`${prefixClass}__method__icon`}
                                        src={
                                            item.icon
                                                ? item.icon
                                                : `http://static.seeyouyima.com/webviewjs/images/${
                                                      ICON_NAME[item.type]
                                                  }.png`
                                        }
                                    />
                                    <div className={`${prefixClass}__method__name`}>
                                        {item.name}
                                    </div>
                                    <img
                                        className={`${prefixClass}__method__status`}
                                        src={
                                            item.type === checkedType
                                                ? 'http://static.seeyouyima.com/webviewjs/images/icon_checked.png'
                                                : 'http://static.seeyouyima.com/webviewjs/images/icon_uncheck.png'
                                        }
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
                <Button
                    type='regular'
                    size='large'
                    width='100%'
                    className={classNames([`${prefixClass}__button`])}
                    {...buttonProps}
                    onClick={onOkClick}
                >
                    {loading ? (
                        <img src={LOADING_ICON} className={`${prefixClass}__button__loading`} />
                    ) : (
                        productDetail?.btn_text ?? '立即支付'
                    )}
                </Button>
                <SafeAreaBottom />
            </div>
        </Drawer>
    );
}
