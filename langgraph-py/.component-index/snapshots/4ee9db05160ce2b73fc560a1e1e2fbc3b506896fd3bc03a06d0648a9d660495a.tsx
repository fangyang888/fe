import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function Size() {
    return <StatusAlert status={ALERT_STATUS_MAP.LOADING} size='small' />;
}
