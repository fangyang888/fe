import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function Demo() {
    return (
        <>
            <StatusAlert status={ALERT_STATUS_MAP.NONE} />
            <StatusAlert status={ALERT_STATUS_MAP.LOADING} />
            <StatusAlert status={ALERT_STATUS_MAP.ERROR} />
            <StatusAlert status={ALERT_STATUS_MAP.NO_NETWORK} />
            <StatusAlert status={ALERT_STATUS_MAP.NO_COLLECTION} />
            <StatusAlert status={ALERT_STATUS_MAP.NO_DATA} />
            <StatusAlert status={ALERT_STATUS_MAP.NO_FOLLOWER} />
            <StatusAlert status={ALERT_STATUS_MAP.NO_MESSAGE} />
            <StatusAlert status={ALERT_STATUS_MAP.NO_RECORD} />
            <StatusAlert status={ALERT_STATUS_MAP.NO_SEARCH_RESULT} />
        </>
    );
}
