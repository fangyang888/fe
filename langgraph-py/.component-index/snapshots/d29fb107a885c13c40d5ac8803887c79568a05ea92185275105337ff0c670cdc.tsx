import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';
import { Space } from 'antd';

export default () => {
    const [checked, setChecked] = useState(true);

    return (
        <Space>
            <Switch
                checked={checked}
                onChange={setChecked}
                width={100}
                height={40}
                thumbRect={14}
            />
            <Switch
                checked={checked}
                onChange={setChecked}
                width={100}
                height={20}
                thumbRect={40}
                thumbColor='#aaa'
            />
        </Space>
    );
};
