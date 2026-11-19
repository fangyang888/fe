import React from 'react';
import { SubscriptionButton } from '@meetyou/react-my';
import { NavBlock } from '../../../../../../src/components';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function Base() {
    return (
        <>
            <NavBlock title='样式一'>
                <div style={WrapperStyle}>
                    <div style={ContentStyle}>
                        <SubscriptionButton
                            title='解锁美柚会员查看你的智能分析'
                            subtitle='成为美柚VIP后你将获得'
                            description='成为美柚VIP，立即解锁丰富小组件'
                            topButton={{ text: '立即测评', protocol: 'pay_button' }}
                            buttonText='立即解锁'
                            isLine
                        />
                    </div>
                </div>
            </NavBlock>
            <NavBlock title='样式二'>
                <div style={WrapperStyle}>
                    <div style={ContentStyle}>
                        <SubscriptionButton
                            title='成为美柚会员'
                            description='成为美柚VIP，立即解锁丰富小组件'
                            buttonText='立即解锁'
                        />
                    </div>
                </div>
            </NavBlock>

            <NavBlock title='样式三'>
                <div style={WrapperStyle}>
                    <div style={ContentStyle}>
                        <SubscriptionButton
                            description='成为美柚VIP，立即解锁丰富小组件'
                            buttonText='立即解锁'
                        />
                    </div>
                </div>
            </NavBlock>
            <NavBlock title='样式四'>
                <div style={WrapperStyle}>
                    <div style={ContentStyle}>
                        <SubscriptionButton buttonText='立即开通' />
                    </div>
                </div>
            </NavBlock>
            <NavBlock title='样式五'>
                <div style={WrapperStyle}>
                    <div style={ContentStyle}>
                        <SubscriptionButton
                            buttonText='立即开通'
                            topButton={{
                                text: '立即测评',
                                protocol: 'pay_button',
                                onClick: () => {
                                    console.log('topButton click');
                                },
                            }}
                        />
                    </div>
                </div>
            </NavBlock>
        </>
    );
}
