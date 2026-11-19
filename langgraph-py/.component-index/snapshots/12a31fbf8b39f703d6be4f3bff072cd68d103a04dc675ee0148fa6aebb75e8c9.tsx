import React from 'react';
import { useNormalizeValue } from '../_hooks';
import { classnames, isEmpty, unitToPx } from '../_utils/base';
import { DEFAULT_GAP, DEFAULT_RECT, SMALL_RECT } from './constants';
import { SwitchProps } from './types';

const Switch: React.FC<SwitchProps> = props => {
    const {
        className,
        style,
        width,
        height,
        thumbRect,
        thumbGap,
        type = 'primary',
        size = 'large',
        defaultChecked,
        checked,
        disabled = false,
        onColor,
        offColor,
        disabledColor,
        thumbColor,
        onChange,
        ...restProps
    } = props;

    /* ------------------------------ BLOCK: 受控 ------------------------------ */
    const [isChecked, setIsChecked] = useNormalizeValue({
        defaultProp: defaultChecked ?? false,
        prop: checked,
        event: onChange,
        isControlled: 'checked' in props,
    });

    /* ------------------------------ BLOCK: wrapper ------------------------------ */
    const wrapperClassName = classnames(
        'my-switch',
        {
            [`my-switch--${type}`]: !!type,
            [`my-switch--${size}`]: !!size,
            'is-checked': isChecked,
            'is-disabled': disabled,
        },
        className,
    );

    const wrapperStyle = {
        width,
        height,
    };

    /* ------------------------------ BLOCK: coreStyle ------------------------------ */
    const coreStyle = {
        ...style,
        width,
        height,
        lineHeight: height,
        borderRadius: !isEmpty(height) ? `${unitToPx(height) / 2}px` : undefined,
        backgroundColor: isEmpty(disabledColor) ? (isChecked ? onColor : offColor) : disabledColor,
        color: isChecked ? onColor : offColor,
    };

    /* ------------------------------ BLOCK: buttonStyle ------------------------------ */
    // thumb
    const switchThumbGap = !isEmpty(thumbGap) ? unitToPx(thumbGap) : DEFAULT_GAP;
    const getThumbMarginLeft = () => {
        if ((isEmpty(thumbRect) && isEmpty(thumbGap)) || !checked) return;
        let switchThumbRect = size === 'large' ? DEFAULT_RECT : SMALL_RECT;
        if (!isEmpty(thumbRect)) switchThumbRect = unitToPx(thumbRect);
        return -(switchThumbRect + switchThumbGap);
    };

    const buttonStyle = {
        ...style,
        height: thumbRect,
        width: thumbRect,
        left: !isEmpty(thumbGap) && !isChecked ? `${switchThumbGap}px` : undefined,
        backgroundColor: !isEmpty(thumbColor) ? thumbColor : undefined,
        marginLeft: getThumbMarginLeft(),
    };

    return (
        <div
            role={'switch'}
            className={wrapperClassName}
            style={wrapperStyle}
            onClick={() => !disabled && setIsChecked(o => !o)}
            {...restProps}
        >
            <span className='my-switch__core' style={coreStyle}>
                <span className='my-switch__button' style={buttonStyle} />
            </span>
        </div>
    );
};

export default Switch;
