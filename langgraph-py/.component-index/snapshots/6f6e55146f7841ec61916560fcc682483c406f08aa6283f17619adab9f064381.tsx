import React from 'react';
// import { Button, ButtonProps } from '@meetyou/react-components';
import Button, { ButtonProps } from '@meetyou/react-components/lib/button';
import { getNavHeight } from '@meetyou/toolbox/lib/browser';
import isString from 'lodash/isString';
import classNames from 'classnames';
import { Size, ALERT_STATUS_MAP } from './types';
import { TIPS, ICONS, commonButtonProps } from './constants';
import LegacyStatusAlert, { LEGACY_ALERT_STATUS_MAP } from '../legacy-status-alert';

export interface StatusAlertProps {
    /** 外层样式名 */
    className?: string;
    /** 自定义样式名前缀 */
    prefixClass?: string;
    /** 状态 */
    status: ALERT_STATUS_MAP;
    /** 尺寸，默认为 large */
    size?: Size;
    /** 自定义渲染内容 */
    content?: React.ReactNode;
    /** 自定义提示语 */
    tips?: { [key: number]: string | React.ReactNode };
    /** 自定义提示语 */
    tip?: string | React.ReactNode;
    /** 自定义占位图 */
    icons?: { [key: number]: any };
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
    /** 是否是旧的小柚子 */
    legacy?: boolean;
}

export default function StatusAlert({
    status = ALERT_STATUS_MAP.LOADING,
    className,
    prefixClass = 'my-status-alert',
    size = 'large',
    content,
    tips = {},
    tip,
    icons = {},
    headerHeight,
    footerHeight,
    buttonProps = {},
    buttonText,
    full,
    legacy,
}: StatusAlertProps) {
    const _tips = { ...TIPS, ...tips };
    const _icons = { ...ICONS, ...icons };

    /** 不显示缺省 */
    if (status === ALERT_STATUS_MAP.NONE) return null;

    /** 显示旧的小柚子缺省 */
    if (legacy) {
        let LegacyStatus = LEGACY_ALERT_STATUS_MAP.LOADING;
        if (
            [
                ALERT_STATUS_MAP.NO_COLLECTION,
                ALERT_STATUS_MAP.NO_FOLLOWER,
                ALERT_STATUS_MAP.NO_RECORD,
                ALERT_STATUS_MAP.NO_SEARCH_RESULT,
                ALERT_STATUS_MAP.NO_DATA,
            ].includes(status)
        ) {
            LegacyStatus = LEGACY_ALERT_STATUS_MAP.NO_DATA;
        } else if ([ALERT_STATUS_MAP.ERROR, ALERT_STATUS_MAP.NO_NETWORK].includes(status)) {
            LegacyStatus = LEGACY_ALERT_STATUS_MAP.NO_NETWORK;
        }

        return (
            <LegacyStatusAlert
                status={LegacyStatus}
                className={className}
                tips={tips}
                tip={tip}
                headerHeight={headerHeight}
                footerHeight={footerHeight}
                buttonProps={buttonProps}
                buttonText={buttonText}
                full={full}
            />
        );
    }

    const _buttonProps = {
        ...commonButtonProps,
        ...buttonProps,
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
            {content ? (
                content
            ) : (
                <div className={`${prefixClass}__content`}>
                    {/* icon */}
                    <img
                        className={classNames(`${prefixClass}__icon`, {
                            [`${prefixClass}__icon-sm`]: size === 'small',
                        })}
                        src={_icons[status]}
                    />

                    {/* tip */}
                    {renderTips()}

                    {/* button */}
                    <div className={`${prefixClass}__button-wrapper`}>
                        {buttonText ? <Button {..._buttonProps}>{buttonText}</Button> : null}
                    </div>
                </div>
            )}
            <div className={`${prefixClass}__after`} />
            {footerHeight ? <div style={{ height: footerHeight }} /> : null}
            {full ? <div className={`${prefixClass}__safe-area-bottom`} /> : null}
        </div>
    );
}
