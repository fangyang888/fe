import React from 'react';
import { Webview, NavBlock } from '@meetyou/react-packages';
import DemoBase from './Base';
import DemoColor from './Color';
import DemoBorder from './Border';
import DemoWhite from './White';
import DemoBackText from './BackText';
import DemoAddon from './Addon';
import DemoScroll from './Scroll';
import DemoTitleGradient from './TitleGradient';
import DemoGradientBackgroundColor from './gradientBackgroundColor';
import DemoOpacityChange from './OpacityChange';
import DemoFooter from './Footer';
import '../../../style/nav-bar.scss';

export default () => {
    return (
        <Webview title='NavBar'>
            <NavBlock title='基本用法'>
                <DemoBase />
            </NavBlock>
            <NavBlock title='页面滚动导航渐变'>
                <DemoScroll />
            </NavBlock>
            <NavBlock title='返回按钮显示文字'>
                <DemoBackText />
            </NavBlock>
            <NavBlock title='背景颜色'>
                <DemoColor />
            </NavBlock>
            <NavBlock title='导航栏下边框'>
                <DemoBorder />
            </NavBlock>
            <NavBlock title='白色主题'>
                <DemoWhite />
            </NavBlock>
            <NavBlock title='自定义右侧区域'>
                <DemoAddon />
            </NavBlock>
            <NavBlock title='渐显标题栏'>
                <DemoTitleGradient />
            </NavBlock>
            <NavBlock title='自定义底部'>
                <DemoFooter />
            </NavBlock>
            <NavBlock title='渐显背景色'>
                <DemoGradientBackgroundColor />
            </NavBlock>
            <NavBlock title='渐显回调事件'>
                <DemoOpacityChange />
            </NavBlock>
        </Webview>
    );
};
