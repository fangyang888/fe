import React, { Fragment, useState } from 'react';
import NumberKeyboard from '../NumberKeyboard';
import { Input } from '@meetyou/react-components';

export default function Addon() {
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
                addon={
                    <div
                        style={{ color: '#ff4d88', cursor: 'pointer' }}
                        onClick={() => setVisible(false)}
                    >
                        确定
                    </div>
                }
                onClose={() => setVisible(false)}
            />
        </Fragment>
    );
}
