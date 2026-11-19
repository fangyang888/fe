import React from 'react';
import { Button, ButtonProps } from '@meetyou/react-components';
import { getNavHeight } from '@meetyou/toolbox/lib/browser';
import isString from 'lodash/isString';
import classNames from 'classnames';
import { LEGACY_ALERT_STATUS_MAP } from './types';
import { commonButtonProps, TIPS } from './constants';

export interface LegacyStatusAlertProps {
    /** 外层样式名 */
    className?: string;
    /** 自定义样式名前缀 */
    prefixClass?: string;
    /** 状态 */
    status: LEGACY_ALERT_STATUS_MAP;
    /** 自定义提示语 */
    tips?: { [key: number]: string | React.ReactNode };
    /** 自定义提示语 */
    tip?: string | React.ReactNode;
    /** 自定义头部占位高度 */
    headerHeight?: number | string;
    /** 自定义底部占位高度 */
    footerHeight?: number | string;
    /** 自定义按钮，参考 https://static.seeyouyima.com/meetyou-react-packages/index.html#/react-components/general/button */
    buttonProps?: ButtonProps;
    /** 按钮文案 */
    buttonText?: string | React.ReactNode;
    /** 是否全屏, 将会自动预留底部安全区占位，如果 pure: true 那么将会预留导航栏高度 */
    full?: {
        /* 是否为沉浸式 */
        pure: boolean;
    };
}

export default function LegacyStatusAlert({
    status = LEGACY_ALERT_STATUS_MAP.LOADING,
    className,
    prefixClass = 'my-legacy-status-alert',
    tips = {},
    tip,
    headerHeight,
    footerHeight,
    buttonProps = {},
    buttonText,
    full,
}: LegacyStatusAlertProps) {
    if (status === LEGACY_ALERT_STATUS_MAP.NONE) return null;
    const _tips = { ...TIPS, ...tips };

    const _buttonProps = {
        ...commonButtonProps,
        ...buttonProps,
    };

    const renderIcon = () => {
        return (
            <div className={`${prefixClass}__icon-wrapper`}>
                {status === LEGACY_ALERT_STATUS_MAP.LOADING ? (
                    <div className={`${prefixClass}__loading`} />
                ) : (
                    <div
                        className={classNames([
                            `${prefixClass}__icon`,
                            {
                                [`${prefixClass}__icon--empty`]:
                                    status === LEGACY_ALERT_STATUS_MAP.NO_DATA,
                                [`${prefixClass}__icon--error`]:
                                    status === LEGACY_ALERT_STATUS_MAP.NO_NETWORK,
                            },
                        ])}
                    />
                )}
            </div>
        );
    };

    const renderTips = () => {
        return (
            <div className={`${prefixClass}__tip-wrapper`}>
                {tip ? (
                    isString(tip) ? (
                        <span className={`${prefixClass}__tip`}>{tip}</span>
                    ) : (
                        tip
                    )
                ) : isString(_tips[status]) ? (
                    <span className={`${prefixClass}__tip`}>{_tips[status]}</span>
                ) : (
                    _tips[status]
                )}
            </div>
        );
    };

    return (
        <div
            className={classNames([
                `${prefixClass}__wrapper`,
                className,
                {
                    [`${prefixClass}__full`]: full,
                },
            ])}
        >
            {full?.pure ? <div style={{ height: getNavHeight() }} /> : null}
            {headerHeight ? <div style={{ height: headerHeight }} /> : null}
            <div className={`${prefixClass}__pre`} />
            <div className={`${prefixClass}__content`}>
                {/* icon */}
                {renderIcon()}

                {/* tip */}
                {renderTips()}

                {/* button */}
                <div className={`${prefixClass}__button-wrapper`}>
                    {buttonText ? <Button {..._buttonProps}>{buttonText}</Button> : null}
                </div>
            </div>
            <div className={`${prefixClass}__after`} />
            {footerHeight ? <div style={{ height: footerHeight }} /> : null}
            {full ? <div className={`${prefixClass}__safe-area-bottom`} /> : null}
        </div>
    );
}
