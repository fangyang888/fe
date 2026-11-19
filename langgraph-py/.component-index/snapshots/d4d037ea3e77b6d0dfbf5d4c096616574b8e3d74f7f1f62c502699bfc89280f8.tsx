import React, { useState } from 'react';
import { Switch } from '@meetyou/react-components';
import { Space } from 'antd';

export default () => {
    const [checked, setChecked] = useState(true);

    return (
        <Space>
            <Switch disabled checked={checked} onChange={setChecked} />
            <Switch disabled disabledColor='#aaa' checked={checked} onChange={setChecked} />
        </Space>
    );
};
