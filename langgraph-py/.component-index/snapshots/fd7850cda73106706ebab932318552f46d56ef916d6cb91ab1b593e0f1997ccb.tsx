import React from 'react';
import { LegacyStatusAlert, LEGACY_ALERT_STATUS_MAP } from '@meetyou/react-my';

const tips = {
    [LEGACY_ALERT_STATUS_MAP.LOADING]: '自定义 loading 文案呀',
    [LEGACY_ALERT_STATUS_MAP.NO_DATA]: '不需要覆盖所有的类型',
};

export default function CustomText() {
    return (
        <>
            <LegacyStatusAlert
                status={LEGACY_ALERT_STATUS_MAP.LOADING}
                tip='我是重新自定义的文案'
            />
            <LegacyStatusAlert status={LEGACY_ALERT_STATUS_MAP.LOADING} tips={tips} />
        </>
    );
}
