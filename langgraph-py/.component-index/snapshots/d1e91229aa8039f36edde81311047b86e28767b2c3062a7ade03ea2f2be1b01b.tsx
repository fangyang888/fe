import React from 'react';
import { SubscriptionButton } from '@meetyou/react-my';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function CustomButton() {
    return (
        <div style={WrapperStyle}>
            <div style={ContentStyle}>
                <SubscriptionButton
                    buttonProps={{
                        type: 'primary',
                        onClick: () => alert('自定义方法'),
                    }}
                />
            </div>
        </div>
    );
}
