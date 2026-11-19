import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

const tips = {
    [ALERT_STATUS_MAP.LOADING]: '自定义 loading 文案呀',
    [ALERT_STATUS_MAP.NO_DATA]: '不需要覆盖所有的类型',
    [ALERT_STATUS_MAP.ERROR]: <span>也可以是自定义的节点</span>,
};

export default function CustomText() {
    return (
        <>
            <StatusAlert status={ALERT_STATUS_MAP.LOADING} tip='我是重新自定义的文案' />
            <StatusAlert status={ALERT_STATUS_MAP.LOADING} tips={tips} />
        </>
    );
}
