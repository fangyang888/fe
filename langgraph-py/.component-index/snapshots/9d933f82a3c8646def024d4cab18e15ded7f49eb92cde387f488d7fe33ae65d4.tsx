import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

const icons = {
    [ALERT_STATUS_MAP.LOADING]: 'https://static.seeyouyima.com/webviewjs/images/status/error.png',
    [ALERT_STATUS_MAP.NO_DATA]: 'https://static.seeyouyima.com/webviewjs/images/status/error.png',
};

export default function CustomText() {
    return <StatusAlert status={ALERT_STATUS_MAP.LOADING} icons={icons} />;
}
