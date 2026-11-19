import React, { Fragment, useState } from 'react';
import NumberKeyboard from '../NumberKeyboard';
import { Input } from '@meetyou/react-components';

export default function Tips() {
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
                maxLength={10}
                decimal={2}
                tips='长度最大10，最多2位小数'
                onClose={() => setVisible(false)}
            />
        </Fragment>
    );
}
