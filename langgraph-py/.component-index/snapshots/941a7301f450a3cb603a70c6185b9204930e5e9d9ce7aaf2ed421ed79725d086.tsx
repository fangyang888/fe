import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as jssdk from '@meetyou/toolbox/lib/jssdk';
import Button, { ButtonProps } from '@meetyou/react-components/lib/button';
import SafeAreaBottom from '@meetyou/react-components/lib/safe-area-bottom';
import PaymentPopup, { PaymentPopupProps } from '../payment-popup';
import { fetchProductDetail } from '../../utils/service';
import { getStorage, setStorage } from '../../utils/meetyou';
import { formatSeconds } from '../../utils/util';
import { ProductDetail } from '../../types';

import classNames from 'classnames';

const isSmallScreen = window?.screen?.width < 375;
const IMAGE_KEY = 'IMAGE_CLOSED';
enum COUNT_STEP {
    纯标签 = 1,
    红包动效 = 2,
    倒计时 = 3,
}

// 按钮类型
// eslint-disable-next-line no-shadow
export enum BUTTON_ACTION {
    SUBSCRIBE = 1, // 订阅按钮
    PAYMENT = 2, // 单次购买按钮
}
export interface TopButtonProps extends ButtonProps {
    text: string | React.ReactNode;
    protocol?: string;
}
export interface SubscriptionButtonProps {
    /** 外层样式名 */
    className?: string;
    /** 自定义样式名前缀 */
    prefixClass?: string;
    /** 组件内容图片，配置了图片，主标题、副标题就不展示 */
    image?: string;
    /** 点击图片的跳转地址 */
    imageUrl?: string;
    /** 点击图片的额外方法 */
    onImageClick?: () => void;
    /** 图片是否可关闭 */
    imageClosable?: boolean;
    /** 点击图片关闭按钮的额外方法 */
    onImageCloseClick?: () => void;
    /** 是否组件缓存图片关闭状态 */
    cacheImageClosed?: boolean;
    /** 场景key，用于缓存图片关闭状态，如果有配置图片可关闭，sceneKey必须 */
    sceneKey?: string;
    /** 主标题文案 */
    title?: string | React.ReactNode;
    /** 副标题文案 */
    subtitle?: string | React.ReactNode;
    /** 副标题2文案 */
    description?: string | React.ReactNode;
    /** 按钮文案 */
    buttonText?: string | React.ReactNode;
    /** 跳转协议: 客户端跳转配置也会转成 meiyou:///xxx进行web协议跳转 */
    protocol?: string;
    /** 副标题线样式：false为服务端下发文字线，true为设计稿细线 */
    isLine?: boolean;
    /** 点击额外方法 */
    onButtonClick?: () => void;
    /** 自定义按钮，参考 https://static.seeyouyima.com/meetyou-react-packages/index.html#/react-components/general/button */
    buttonProps?: ButtonProps;
    /** 上方按钮配置 */
    topButton?: TopButtonProps;
    /** 卡片上方是否圆角 */
    showRadius?: boolean;
    /** 卡片上方是否显示阴影，false 时显示边框 */
    showShadow?: boolean;
    /** 支付弹窗的 props */
    paymentProps?: PaymentPopupProps;
    /** 按钮右上方的标签 */
    tagText?: string;
    /** 倒计时，单位秒，默认0，不为0时展示红包动效和倒计时 */
    countDown?: number;
    /** 倒计时结束的回调 */
    afterCountDown?: () => void;
}
export default function SubscriptionButton({
    className,
    prefixClass = 'my-subscription-button',
    image,
    imageUrl,
    onImageClick,
    imageClosable,
    onImageCloseClick,
    cacheImageClosed = true,
    sceneKey,
    title,
    subtitle,
    description,
    buttonText = '立即开通',
    protocol,
    buttonProps = {},
    isLine,
    onButtonClick,
    topButton,
    showRadius = false,
    showShadow = false,
    paymentProps,
    tagText,
    countDown,
    afterCountDown,
}: SubscriptionButtonProps) {
    const [payPopupVisible, setPayPopupVisible] = useState(false);
    const [productDetail, setProductDetail] = useState<ProductDetail>(); // 商品详情
    const [countDownStep, setCountDownStep] = useState(0);
    const [count, setCount] = useState(countDown ?? 0);
    const countTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showImage, setShowImage] = useState(false);
    const storageKey = useMemo(() => `${IMAGE_KEY}_${sceneKey ?? ''}`, [sceneKey]);

    useEffect(() => {
        if (!image) return;

        if (cacheImageClosed && sceneKey) {
            setShowImage(true);
            getStorage(storageKey).then(data => {
                // 图片未被手动关闭过
                if (!data?.includes(image)) {
                    setShowImage(true);
                }
            });
        } else {
            setShowImage(true);
        }
    }, [cacheImageClosed, sceneKey, image, storageKey]);

    useEffect(() => {
        if (!tagText && !countDown) return;
        let timeout: ReturnType<typeof setTimeout>;
        if (tagText && !countDown) {
            setCountDownStep(COUNT_STEP.纯标签);
        } else if (countDown) {
            setCountDownStep(COUNT_STEP.红包动效);
            timeout = setTimeout(() => {
                setCountDownStep(COUNT_STEP.倒计时);
                if (countTimerRef.current) {
                    clearInterval(countTimerRef.current);
                }
                countTimerRef.current = setInterval(() => {
                    setCount(prev => {
                        if (prev === 0) {
                            clearInterval(countTimerRef.current as any as number);
                            afterCountDown?.();
                            return prev;
                        }
                        return prev - 1;
                    });
                }, 1000);
            }, 800);
        }
        return () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            if (countTimerRef.current) {
                clearInterval(countTimerRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tagText, countDown]);

    // 按钮组，buttonList[0]是底部按钮，buttonList[1](如果有)是单次购买支付按钮
    const buttonList = useMemo(() => {
        const btns = [];
        btns.push({
            text: buttonText,
            protocol,
            onButtonClick,
            ...buttonProps,
            action:
                (protocol ?? '').indexOf('pay_button') > -1
                    ? BUTTON_ACTION.PAYMENT
                    : BUTTON_ACTION.SUBSCRIBE,
        });
        if (topButton && topButton.text && topButton.protocol) {
            const { onClick, ...restTopButton } = topButton;
            btns.push({
                ...restTopButton,
                onButtonClick: onClick,
                action:
                    (topButton.protocol ?? '').indexOf('pay_button') > -1
                        ? BUTTON_ACTION.PAYMENT
                        : BUTTON_ACTION.SUBSCRIBE,
            });
        }
        return btns;
    }, [buttonText, protocol, onButtonClick, buttonProps, topButton]);

    const hasPayButton = useMemo(() => {
        return !!buttonList.find(btn => btn.action === BUTTON_ACTION.PAYMENT);
    }, [buttonList]);

    // 如果有支付按钮就获取商品详情
    useEffect(() => {
        if (!hasPayButton || !paymentProps?.productKey) return;

        fetchProductDetail(paymentProps.productKey)
            .then(res => {
                if (res.code === 0) {
                    setProductDetail(res.data);
                }
            })
            .catch(error => {
                const { message } = (error ?? {}) as Error;
                console.log(message);
            });
    }, [hasPayButton, paymentProps]);

    // 使用配置图片时，屏幕小于375时按钮高度40，字体15
    const isMediumBtn = useMemo(() => image && isSmallScreen, [image]);

    const handleButtonClick = useCallback(btnProps => {
        const { onButtonClick: onBtnClick, protocol: btnProtocol, action } = btnProps;
        onBtnClick?.();
        if (!btnProtocol) return;
        if (action === BUTTON_ACTION.PAYMENT) {
            setPayPopupVisible(true);
        } else {
            jssdk.openWebpage(btnProtocol);
        }
    }, []);

    const renderButton = useCallback(
        btnProps => {
            if (!btnProps) return null;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { text, protocol: _p, onButtonClick: _c, action, ...restBtnProps } = btnProps;
            const isPaymentButton = action === BUTTON_ACTION.PAYMENT;
            let btnText = text;
            if (typeof text === 'string' && isPaymentButton) {
                btnText = text.replace(
                    '{y}',
                    productDetail?.price ? `¥ ${(productDetail?.price / 100).toFixed(2)} ` : '',
                );
            }
            return (
                <div className={`${prefixClass}__button-wrapper`}>
                    <Button
                        className={classNames([
                            `${prefixClass}__button`,
                            {
                                [`${prefixClass}__button-gradient`]: !isPaymentButton,
                            },
                            { [`${prefixClass}__button__medium`]: isMediumBtn },
                        ])}
                        type='regular'
                        plain={isPaymentButton}
                        size={isMediumBtn ? 'medium' : 'large'}
                        width='100%'
                        onClick={() => handleButtonClick(btnProps)}
                        {...restBtnProps}
                    >
                        {btnText}
                    </Button>
                    {(tagText || countDown) && !isPaymentButton && (
                        <div className={`${prefixClass}__tag-wrapper`}>
                            {countDownStep === COUNT_STEP.红包动效 && (
                                <div className={`${prefixClass}__tag-animate`} />
                            )}
                            <div
                                className={classNames([
                                    `${prefixClass}__tag-content`,
                                    {
                                        show: countDownStep === COUNT_STEP.纯标签,
                                        unfold: countDownStep === COUNT_STEP.倒计时,
                                    },
                                ])}
                            >
                                {`${tagText}${count ? ` ${formatSeconds(count)}` : ''}`}
                            </div>
                        </div>
                    )}
                </div>
            );
        },
        [
            prefixClass,
            isMediumBtn,
            handleButtonClick,
            productDetail,
            tagText,
            countDown,
            countDownStep,
            count,
        ],
    );

    const renderContent = useMemo(() => {
        const hasContent = title || subtitle || description;
        return (
            <div
                className={classNames([
                    `${prefixClass}__content`,
                    {
                        [`${prefixClass}__content__bg`]: hasContent,
                        [`${prefixClass}__content-empty`]: !hasContent,
                    },
                ])}
            >
                {/* title */}
                {title ? <div className={`${prefixClass}__title`}>{title}</div> : null}

                {/* subtitle */}
                {subtitle ? (
                    <div className={`${prefixClass}__subtitle`}>
                        {isLine && <div className={`${prefixClass}__line`} />}
                        <span>{subtitle}</span>
                        {isLine && <div className={`${prefixClass}__line`} />}
                    </div>
                ) : null}

                {/* description */}
                {description ? (
                    <div className={`${prefixClass}__description`}>{description}</div>
                ) : null}
                {/* button */}
                {renderButton(buttonList[1])}
                {renderButton(buttonList[0])}
            </div>
        );
    }, [prefixClass, title, subtitle, description, isLine, renderButton, buttonList]);

    const handleImageClick = useCallback(() => {
        if (!imageUrl) return;
        onImageClick?.();
        jssdk.openWebpage(imageUrl);
    }, [imageUrl, onImageClick]);

    const handleImageClose = useCallback(async () => {
        onImageCloseClick?.();
        setShowImage(false);
        if (sceneKey && cacheImageClosed) {
            const closedImages = (await getStorage(storageKey)) ?? [];
            setStorage(storageKey, [...closedImages, image]);
        }
    }, [onImageCloseClick, sceneKey, cacheImageClosed, image, storageKey]);

    const renderImageContent = useMemo(
        () => (
            <div
                className={classNames([
                    `${prefixClass}__content`,
                    `${prefixClass}__content__image`,
                    { [`${prefixClass}__content__image-closed`]: !showImage },
                ])}
            >
                {showImage && (
                    <>
                        <img
                            src={image}
                            className={`${prefixClass}__image`}
                            onClick={handleImageClick}
                        />
                        {imageClosable && (
                            <div
                                className={`${prefixClass}__close-icon`}
                                onClick={handleImageClose}
                            />
                        )}
                    </>
                )}
                {/* button */}
                {renderButton(buttonList[1])}
                {renderButton(buttonList[0])}
            </div>
        ),
        [
            prefixClass,
            image,
            renderButton,
            buttonList,
            handleImageClick,
            handleImageClose,
            showImage,
            imageClosable,
        ],
    );

    return (
        <>
            <div
                className={classNames([
                    `${prefixClass}__wrapper`,
                    { [`${prefixClass}__radius`]: showRadius },
                    { [`${prefixClass}__shadow`]: showShadow },
                    className,
                ])}
            >
                {image ? renderImageContent : renderContent}
                <SafeAreaBottom />
            </div>
            {/* 支付弹窗 */}
            {hasPayButton && paymentProps ? (
                <PaymentPopup
                    visible={payPopupVisible}
                    onVisibleChange={setPayPopupVisible}
                    productData={productDetail}
                    {...paymentProps}
                />
            ) : null}
        </>
    );
}
