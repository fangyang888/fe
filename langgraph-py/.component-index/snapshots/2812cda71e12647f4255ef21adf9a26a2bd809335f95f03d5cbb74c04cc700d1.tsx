import React from 'react';
import { Webview, NavBlock } from '@meetyou/react-packages';
import DemoBase from './Base';
import CustomButton from './CustomButton';
import Image from './Image';
import Radius from './Radius';
import Payment from './Payment';
import Shadow from './Shadow';
import ImageClosable from './ImageClosable';
import Tag from './Tag';
import '../../../style/subscription-button.scss';

export default () => {
    return (
        <Webview title='SubscriptionButton'>
            <NavBlock title='基本用法'>
                <DemoBase />
            </NavBlock>
            <NavBlock title='自定义按钮'>
                <CustomButton />
            </NavBlock>
            <NavBlock title='配置图片'>
                <Image />
            </NavBlock>
            <NavBlock title='配置图片可点击、可关闭'>
                <ImageClosable />
            </NavBlock>
            <NavBlock title='配置卡片顶部圆角'>
                <Radius />
            </NavBlock>
            <NavBlock title='配置卡片顶部阴影'>
                <Shadow />
            </NavBlock>
            <NavBlock title='配置支付按钮'>
                <Payment />
            </NavBlock>
            <NavBlock title='配置下方按钮标签和红包动效'>
                <Tag />
            </NavBlock>
        </Webview>
    );
};
