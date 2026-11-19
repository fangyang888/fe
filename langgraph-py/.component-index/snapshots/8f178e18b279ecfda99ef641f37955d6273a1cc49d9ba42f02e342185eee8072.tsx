import React from 'react';
import { SubscriptionButton } from '@meetyou/react-my';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function ImageClosable() {
    return (
        <div style={WrapperStyle}>
            <div style={ContentStyle}>
                <SubscriptionButton
                    image='https://test-sc.seeyouyima.com/sub-admin/img/0/e97161b3-a3c8-4548-b43f-785a5cdb21fa_750_264.png'
                    imageUrl='meiyou:///tools/ymb/home'
                    sceneKey='baby-test'
                    imageClosable
                />
            </div>
        </div>
    );
}
