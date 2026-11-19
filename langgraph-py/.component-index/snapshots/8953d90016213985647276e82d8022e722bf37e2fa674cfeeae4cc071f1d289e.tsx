import React from 'react';
import { SubscriptionButton } from '@meetyou/react-my';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function Image() {
    return (
        <div style={WrapperStyle}>
            <div style={ContentStyle}>
                <SubscriptionButton image='https://test-sc.seeyouyima.com/biz_cs/img/example_project/20240419160413713.png' />
            </div>
        </div>
    );
}
