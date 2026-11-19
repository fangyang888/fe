import React from 'react';
import { StatusAlert, ALERT_STATUS_MAP } from '@meetyou/react-my';

export default function Demo() {
    return (
        <>
            <StatusAlert legacy status={ALERT_STATUS_MAP.NONE} />
            <StatusAlert legacy status={ALERT_STATUS_MAP.LOADING} />
            <StatusAlert legacy status={ALERT_STATUS_MAP.ERROR} tip='加载失败，稍等一下再试吧' />
            <StatusAlert status={ALERT_STATUS_MAP.NO_NETWORK} legacy buttonText='重新加载' />
            <StatusAlert
                legacy
                status={ALERT_STATUS_MAP.NO_COLLECTION}
                tip='您还没收藏任何商品哦'
            />
            <StatusAlert legacy status={ALERT_STATUS_MAP.NO_DATA} />
            <StatusAlert legacy status={ALERT_STATUS_MAP.NO_FOLLOWER} tip='还没有关注的人' />
            <StatusAlert legacy status={ALERT_STATUS_MAP.NO_MESSAGE} tip='暂时没有消息' />
            <StatusAlert legacy status={ALERT_STATUS_MAP.NO_RECORD} tip='暂无记录' />
            <StatusAlert legacy status={ALERT_STATUS_MAP.NO_SEARCH_RESULT} tip='暂无搜索结果' />
        </>
    );
}
