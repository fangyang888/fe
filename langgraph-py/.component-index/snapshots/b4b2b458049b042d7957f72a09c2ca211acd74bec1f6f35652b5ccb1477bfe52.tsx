import React from 'react';
import { SubscriptionButton } from '@meetyou/react-my';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function Shadow() {
    return (
        <div style={WrapperStyle}>
            <div style={ContentStyle}>
                <SubscriptionButton
                    title='解锁美柚会员查看你的智能分析'
                    subtitle='成为美柚VIP后你将获得'
                    description='成为美柚VIP，立即解锁丰富小组件'
                    buttonText='立即解锁'
                    showShadow
                />
            </div>
        </div>
    );
}
