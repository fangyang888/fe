import React, { useRef } from 'react';
import classNames from 'classnames';
import { Drawer, SafeAreaBottom, Toast } from '@meetyou/react-components';
import { useClickAway } from '@meetyou/react-hooks';
import NumberKeyboardKey from './NumberKeyboardKey';

export interface NumberKeyboardProps {
    /** 外层样式名 */
    className?: string;
    /** 自定义样式名前缀 */
    prefixClass?: string;
    /** 是否显示键盘 */
    visible?: boolean;
    /** 键盘标题 */
    title?: string;
    /** 当前输入值 */
    value?: string | number;
    /** 自定义键盘标题右侧 */
    addon?: React.ReactNode;
    /** 自定义键盘标题左侧 */
    prefix?: React.ReactNode;
    /** 最大输入长度 */
    maxLength?: number;
    /** 输入值不符合时的提示文案 */
    tips?: string;
    /** 小数位 */
    decimal?: number;
    /** 是否在点击外部时收起键盘 */
    hideOnClickOutside?: boolean;
    /** 点击数字键时触发 */
    onValueChange?: (val: string) => void;
    /** 点击删除键时触发 */
    onDelete?: () => void;
    /** 点击关闭按钮时触发 */
    onClose?: () => void;
    /** 点击非键盘区域时触发 */
    onBlur?: () => void;
}

const NUMBER_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function NumberKeyboard({
    className,
    prefixClass = 'my-number-keyboard',
    visible,
    onClose,
    title,
    prefix,
    addon,
    value,
    maxLength,
    decimal,
    hideOnClickOutside = false,
    tips = '达到输入上限',
    onValueChange,
    onBlur,
}: NumberKeyboardProps) {
    const keyboardRef = useRef<HTMLDivElement>(null);

    const handleBlur = () => {
        if (visible && hideOnClickOutside) {
            onClose?.();
            onBlur?.();
        }
    };
    // 监听touchstart事件，点击键盘区域外收起键盘
    useClickAway(keyboardRef, handleBlur, 'touchstart');

    const handleNumberClick = (num?: string) => {
        let result = `${value ? value : ''}${num}`;

        const numArr = result.split('.');
        // 如果输入多个小数点，过滤掉
        if (numArr.length > 2) {
            result = numArr[0] + '.' + numArr[1];
        }
        // 输入的是小数，判断是否超过小数限制
        if (numArr.length === 2) {
            if (decimal && numArr[1].length > decimal) {
                Toast.open({ content: tips });
            }
            numArr[1] = numArr[1].substring(0, decimal);
            result = numArr[0] + '.' + numArr[1];
        }
        if (maxLength && result.length > maxLength) {
            result = result.substring(0, maxLength);
            Toast.open({ content: tips });
        }
        onValueChange?.(result);
    };

    const handleDeleteNumber = () => {
        const temp = value + '';
        const num = temp.substring(0, temp.length - 1);
        onValueChange?.(num);
    };

    return (
        <Drawer
            className='my-number-keyboard__root'
            showMask={false}
            visible={visible}
            onVisibleChange={onClose}
        >
            <div ref={keyboardRef} className={classNames([`${prefixClass}__wrapper`, className])}>
                <div className={`${prefixClass}__header`}>
                    <div className={`${prefixClass}__title`}>{title}</div>
                    <div className={`${prefixClass}__prefix`}>{prefix}</div>
                    <div className={`${prefixClass}__addon`}>
                        {addon ? (
                            addon
                        ) : (
                            <img
                                className='icon-close'
                                src='https://static.seeyouyima.com/bbj/keybord-arrow-down-circle.png'
                                onClick={onClose}
                            />
                        )}
                    </div>
                </div>
                <div className={`${prefixClass}__content`}>
                    {NUMBER_LIST.map(item => (
                        <NumberKeyboardKey
                            key={item}
                            text={`${item}`}
                            onKeyClick={handleNumberClick}
                        />
                    ))}
                    <NumberKeyboardKey text='.' onKeyClick={handleNumberClick} />
                    <NumberKeyboardKey text='0' onKeyClick={handleNumberClick} />
                    <NumberKeyboardKey type='delete' onKeyClick={handleDeleteNumber} />
                </div>
                <SafeAreaBottom />
            </div>
        </Drawer>
    );
}
