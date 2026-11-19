import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function CustomText() {
    return (
        <StatusAlert
            status={ALERT_STATUS_MAP.NO_DATA}
            content={<span>我也可以自定义渲染的内容</span>}
        />
    );
}
