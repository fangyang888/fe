import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { isNotch, isHarmony } from '@meetyou/toolbox/lib/browser';
import * as jssdk from '@meetyou/toolbox/lib/jssdk';
import { useScroll } from '@meetyou/react-hooks';
import { default as mergeClass } from 'classnames';
import { NavPosition, NavType } from './types';
import { convertColorToRgb } from './util';

const IMG_URL = 'https://static.seeyouyima.com/webviewjs/images/nav/';
const BACK_ICON = `${IMG_URL}icon-back.png`;
const BACK_ICON_WHITE = `${IMG_URL}icon-back-white.png`;

export interface NavBarProps {
    /** 外层样式名 */
    className?: string;
    /** 自定义样式名前缀 */
    prefixClass?: string;
    /** 导航布局 */
    position?: NavPosition;
    /** 导航类型，默认黑色，还有白色和透明渐变 */
    type?: NavType;
    /** 自定义返回事件 */
    goBack?: () => void;
    /** 背景色透明度变化事件 */
    onOpacityChange?: (opacity?: number) => void;
    /** 底部边框（备用） */
    border?: boolean;
    /** 自定义彩色导航 */
    backgroundColor?: string;
    /** 透明渐变模式下的自定义颜色渐变，仅支持rgb，rgba， #开头的色值 */
    gradientBackgroundColor?: string;
    /** 自定义导航右侧 */
    addon?: React.ReactNode;
    /** 自定义导航左侧 */
    prefix?: React.ReactNode;
    /** 自定义导航左侧返回文案 */
    backText?: string | React.ReactNode;
    /** 自定义导航底部 */
    footer?: React.ReactNode;
    /** 导航标题 */
    children?: React.ReactNode;
    /** 滚动元素，用于获取元素滚动高度计算背景颜色透明度 */
    scrollRef?: React.RefObject<HTMLDivElement>;
    /** 默认滚动长度 */
    scrollDistance?: number;
    /** 开始渐变的高度位置，默认0 */
    scrollOffsetTop?: number;
    /** 标题滚动逐渐显示 */
    titleGradidentShow?: boolean;
    /** 滚动渐变有footer时，是否footer渐渐显示横线*/
    gradidentFooterLine?: boolean;
    /** 自定义是否显示刘海屏 */
    isFull?: boolean;
}

export default function NavBar({
    className,
    prefixClass = 'my-nav-bar',
    position = 'relative',
    type = 'black',
    border = false,
    backgroundColor,
    gradientBackgroundColor,
    children,
    addon,
    prefix,
    backText,
    goBack,
    footer,
    scrollRef,
    scrollDistance = 96,
    scrollOffsetTop = 0,
    titleGradidentShow = false,
    gradidentFooterLine = false,
    isFull,
    onOpacityChange,
}: NavBarProps) {
    /* ---------- class ---------- */
    const wrapperClassName = mergeClass(
        `${prefixClass}-wrapper`,
        {
            'is-full': isNotch() || isHarmony || isFull,
            'is-fixed': position === 'fixed',
        },
        className,
    );
    const rootClassName = mergeClass(`${prefixClass}`, {
        [`${prefixClass}--border`]: border,
        'is-full': isNotch() || isHarmony || isFull,
    });
    const bodyClassName = mergeClass(`${prefixClass}__body`, {
        [`${prefixClass}__body--white`]: type === 'white',
    });

    /* ---------- BLOCK: 设置导航背景色透明度  ---------- */
    const { top } = useScroll({ target: scrollRef });
    const [opacity, setOpacity] = useState(0);

    // 样式变色
    const rootStyle = useMemo(() => {
        if (type !== 'gradient') {
            return {
                backgroundColor,
            };
        }

        let bColor = `rgba(242, 242, 245, ${opacity})`;

        if (gradientBackgroundColor) {
            if (opacity === 1) {
                bColor = gradientBackgroundColor;
            } else {
                // 色值转换成rgb
                const rgb = convertColorToRgb(gradientBackgroundColor);
                if (rgb?.r !== undefined && rgb?.g !== undefined && rgb?.b !== undefined) {
                    bColor = `rgba(${rgb?.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
                }
            }
        }
        return {
            backgroundColor: bColor,
        };
    }, [type, backgroundColor, gradientBackgroundColor, opacity]);

    const titleStyle = useMemo(() => {
        return {
            opacity: titleGradidentShow ? opacity : 1,
        };
    }, [opacity, titleGradidentShow]);

    useEffect(() => {
        if (type !== 'gradient') return;
        let diff = 0;
        const scrollTop = top - scrollOffsetTop;
        diff = isNaN(scrollTop / scrollDistance) ? 0 : scrollTop / scrollDistance;
        // if (scrollTop < 0) {
        //     setOpacity(0);
        // } else {
        //     setOpacity(Math.max(Math.min(diff, 1), 0));
        // }
        const newOpacity = scrollTop < 0 ? 0 : Math.max(Math.min(diff, 1), 0);
        setOpacity(newOpacity);
        onOpacityChange?.(newOpacity);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [top, scrollDistance, type, scrollOffsetTop]);

    // 设置边界线背景色透明度
    const renderLine = () => {
        return type === 'gradient' ? (
            <div style={{ opacity }} className={`${prefixClass}__line`} />
        ) : null;
    };

    /* ---------- BLOCK: 导航左侧 ---------- */
    // 默认导航事件
    const onGoBack = useCallback(
        e => {
            e.stopPropagation();
            goBack ? goBack?.() : jssdk.callNative('goback');
        },
        [goBack],
    );

    const renderBack = () => {
        return (
            <div className={`${prefixClass}__back`} onClick={onGoBack}>
                <img src={type === 'white' ? BACK_ICON_WHITE : BACK_ICON} />
                <div className={`${prefixClass}__prefix`}>{backText}</div>
            </div>
        );
    };

    return (
        <div className={wrapperClassName}>
            <div className={rootClassName} style={rootStyle}>
                <div className={bodyClassName}>
                    {prefix ? prefix : renderBack()}
                    <div className={`${prefixClass}__title`} style={titleStyle}>
                        {children}
                    </div>
                    <div className={`${prefixClass}__addon`}>{addon}</div>
                </div>
                {!gradidentFooterLine && renderLine()}

                {footer && <div className={`${prefixClass}__footer`}>{footer}</div>}
                {gradidentFooterLine && renderLine()}
            </div>
        </div>
    );
}
