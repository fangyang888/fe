import React, { Fragment, useState } from 'react';
import NumberKeyboard from '../NumberKeyboard';
import { Input } from '@meetyou/react-components';

export default function Prefix() {
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
                prefix={<div style={{ color: '#ff4d88' }}>自定义左侧</div>}
                onClose={() => setVisible(false)}
            />
        </Fragment>
    );
}
