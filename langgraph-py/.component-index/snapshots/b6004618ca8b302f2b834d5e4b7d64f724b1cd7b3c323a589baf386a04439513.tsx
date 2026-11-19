import React from 'react';
import { LegacyStatusAlert, LEGACY_ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function Demo() {
    return (
        <>
            <LegacyStatusAlert status={LEGACY_ALERT_STATUS_MAP.NONE} />
            <LegacyStatusAlert status={LEGACY_ALERT_STATUS_MAP.LOADING} />
            <LegacyStatusAlert status={LEGACY_ALERT_STATUS_MAP.NO_DATA} />
            <LegacyStatusAlert status={LEGACY_ALERT_STATUS_MAP.NO_NETWORK} />
        </>
    );
}
