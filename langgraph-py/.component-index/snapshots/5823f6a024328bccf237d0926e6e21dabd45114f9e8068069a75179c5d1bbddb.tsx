import React from 'react';
import { SubscriptionButton } from '@meetyou/react-my';
import { NavBlock } from '@meetyou/react-packages';
const WrapperStyle = { background: '#f2f2f5', transform: 'translate(0,0)' };
const ContentStyle = { height: '80vh', overflow: 'auto', padding: 0 };
export default function Payment() {
    return (
        <>
            <NavBlock title='开通会员按钮+单次购买支付按钮'>
                <div style={WrapperStyle}>
                    <div style={ContentStyle}>
                        <SubscriptionButton
                            buttonText='{y}立即测评'
                            protocol='pay_button'
                            topButton={{
                                text: '立即解锁',
                                protocol: 'meiyou:///subscribe/pay/page',
                                onClick: () => {
                                    console.log('开通会员');
                                },
                            }}
                            paymentProps={{
                                productKey: 'baby_24_month_assessment',
                                sceneKey: 'beiyunzixun',
                            }}
                        />
                    </div>
                </div>
            </NavBlock>
            <NavBlock title='单次购买支付按钮+开通会员按钮'>
                <div style={WrapperStyle}>
                    <div style={ContentStyle}>
                        <SubscriptionButton
                            topButton={{ text: '{y}立即测评', protocol: 'pay_button' }}
                            buttonText='立即解锁'
                            protocol='meiyou:///subscribe/pay/page'
                            paymentProps={{
                                productKey: 'baby_24_month_assessment',
                                sceneKey: 'beiyunzixun',
                            }}
                        />
                    </div>
                </div>
            </NavBlock>
        </>
    );
}
