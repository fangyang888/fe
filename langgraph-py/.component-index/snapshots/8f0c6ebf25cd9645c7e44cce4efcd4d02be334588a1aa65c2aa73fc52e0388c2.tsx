import React, { Fragment, useState } from 'react';
import NumberKeyboard from '../NumberKeyboard';
import { Input } from '@meetyou/react-components';

export default function Title() {
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
                title='数字键盘'
                value={value}
                onValueChange={onChange}
                onClose={() => setVisible(false)}
            />
        </Fragment>
    );
}
