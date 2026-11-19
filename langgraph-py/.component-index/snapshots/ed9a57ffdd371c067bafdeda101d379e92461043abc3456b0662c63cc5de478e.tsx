import React from 'react';
import { Button } from '@meetyou/react-components';
import { Space } from 'antd';

export default () => {
    return (
        <Space direction='vertical'>
            <Button type='primary' size='xsmall'>
                XSmall Button
            </Button>
            <Button type='primary' size='small'>
                Small Button
            </Button>
            <Button type='primary' size='medium'>
                Medium Button
            </Button>
            <Button type='primary' size='large' width={290}>
                Large Button
            </Button>
        </Space>
    );
};
