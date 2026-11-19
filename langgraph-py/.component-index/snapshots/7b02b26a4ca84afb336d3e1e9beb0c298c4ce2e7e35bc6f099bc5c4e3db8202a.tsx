import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';
import { Space } from 'antd';

export default () => {
    const [checked, setChecked] = useState(true);
    return (
        <Space>
            <Switch size='large' checked={checked} onChange={setChecked} />
            <Switch size='small' checked={checked} onChange={setChecked} />
        </Space>
    );
};
