import React from 'react';
import classNames from 'classnames';

interface NumberKeyboardKeyProps {
    text?: string;
    type?: '' | 'delete';
    onKeyClick?: (text?: string) => void;
}

export default function NumberKeyboardKey({ text, type = '', onKeyClick }: NumberKeyboardKeyProps) {
    return (
        <span
            className={classNames(['num-button', { delete: type === 'delete' }])}
            onClick={() => onKeyClick?.(text)}
        >
            {text ? text : null}
        </span>
    );
}
