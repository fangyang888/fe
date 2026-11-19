import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function Full() {
    return <StatusAlert status={ALERT_STATUS_MAP.LOADING} full={{ pure: true }} />;
}
