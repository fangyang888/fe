import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';
import { Space } from 'antd';

export default () => {
    const [checked, setChecked] = useState(true);

    return (
        <Space>
            <Switch type='primary' checked={checked} onChange={setChecked} />
            <Switch type='regular' checked={checked} onChange={setChecked} />
        </Space>
    );
};
