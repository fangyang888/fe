import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function CustomButton() {
    return (
        <>
            <StatusAlert status={ALERT_STATUS_MAP.NO_NETWORK} buttonText='重新加载' />
            <StatusAlert status={ALERT_STATUS_MAP.ERROR} buttonText='重新加载' />
            <StatusAlert
                status={ALERT_STATUS_MAP.NO_DATA}
                buttonProps={{ type: 'info' }}
                buttonText='按钮也可以自定义'
            />
        </>
    );
}
