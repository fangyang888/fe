import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function Demo() {
    return <StatusAlert status={ALERT_STATUS_MAP.LOADING} />;
}
