import React from 'react';
import { SubscriptionButton } from '@meetyou/react-my';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function Tag() {
    return (
        <div style={WrapperStyle}>
            <div style={ContentStyle}>
                <SubscriptionButton
                    image='https://test-sc.seeyouyima.com/sub-admin/img/0/e97161b3-a3c8-4548-b43f-785a5cdb21fa_750_264.png'
                    imageUrl='meiyou:///tools/ymb/home'
                    tagText='限时特惠'
                    countDown={10}
                    afterCountDown={() => {
                        console.log('倒计时结束');
                    }}
                />
            </div>
        </div>
    );
}
