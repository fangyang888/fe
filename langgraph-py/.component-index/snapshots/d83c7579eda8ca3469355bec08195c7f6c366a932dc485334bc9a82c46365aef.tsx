import React from 'react';
import { Webview, NavBlock } from '@meetyou/react-packages';
import DemoBase from './Base';
import '../../../style/payment-popup.scss';

export default () => {
    return (
        <Webview title='SubscriptionButton'>
            <NavBlock title='基本用法'>
                <DemoBase />
            </NavBlock>
        </Webview>
    );
};
