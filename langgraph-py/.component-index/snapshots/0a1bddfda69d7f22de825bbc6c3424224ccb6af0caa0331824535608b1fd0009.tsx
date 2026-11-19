import React, { Fragment, useState } from 'react';
import NumberKeyboard from '../NumberKeyboard';
import { Input } from '@meetyou/react-components';

export default function Blur() {
    const [visible, setVisible] = useState(false);
    const [value, setValue] = useState('');
    const handleOpen = () => {
        setVisible(true);
    };

    const onChange = (val: string) => {
        setValue(val);
    };

    return (
        <Fragment>
            <Input value={value} disabled onClick={handleOpen} />
            <NumberKeyboard
                visible={visible}
                value={value}
                onValueChange={onChange}
                hideOnClickOutside
                onClose={() => setVisible(false)}
                onBlur={() => {
                    console.log('点击非键盘区域');
                }}
            />
        </Fragment>
    );
}
