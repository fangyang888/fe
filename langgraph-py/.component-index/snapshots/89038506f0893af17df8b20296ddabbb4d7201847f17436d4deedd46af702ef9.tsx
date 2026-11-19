import React from 'react';
import { LegacyStatusAlert, LEGACY_ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function HeaderHeight() {
    return <LegacyStatusAlert status={LEGACY_ALERT_STATUS_MAP.LOADING} full={{ pure: true }} />;
}
