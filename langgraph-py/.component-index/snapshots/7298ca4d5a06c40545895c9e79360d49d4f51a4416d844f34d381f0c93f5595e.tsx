import React, { useState } from 'react';
import { Input } from '@meetyou/react-components';

export default () => {
    const [value, setValue] = useState('');

    return (
        <Input
            value={value}
            onChange={setValue}
            placeholder='请输入'
            label={<span className='my-demo-input__label'>姓名：</span>}
        />
    );
};
