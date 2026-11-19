import React from 'react';
import { LegacyStatusAlert, LEGACY_ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function CustomButton() {
    return (
        <>
            <LegacyStatusAlert status={LEGACY_ALERT_STATUS_MAP.NO_NETWORK} buttonText='重新加载' />

            <LegacyStatusAlert
                status={LEGACY_ALERT_STATUS_MAP.NO_DATA}
                buttonProps={{ type: 'info' }}
                buttonText='按钮也可以自定义'
            />
        </>
    );
}
