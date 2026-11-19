import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';
import { Space } from 'antd';

export default () => {
    const [checked, setChecked] = useState(true);

    return (
        <Space>
            <Switch checked={checked} onChange={setChecked} thumbGap={4} />
            <Switch size='small' checked={checked} onChange={setChecked} thumbGap={4} />
        </Space>
    );
};
