import React from 'react';
import { Webview, DemoBlock } from '@meetyou/react-packages';
import DemoBasic from './demo-basic';
import DemoType from './demo-type';
import DemoColor from './demo-color';
import DemoThumbColor from './demo-thumb-color';
import DemoDisabled from './demo-disabled';
import DemoSize from './demo-size';
import DemoRect from './demo-rect';
import DemoThumbGap from './demo-thumb-gap';

export default () => {
    return (
        <Webview title='Switch'>
            <DemoBlock title='基本用法'>
                <DemoBasic />
            </DemoBlock>
            <DemoBlock title='开关类型'>
                <DemoType />
            </DemoBlock>
            <DemoBlock title='开关背景色'>
                <DemoColor />
            </DemoBlock>
            <DemoBlock title='开关圆形按钮色'>
                <DemoThumbColor />
            </DemoBlock>
            <DemoBlock title='禁用'>
                <DemoDisabled />
            </DemoBlock>
            <DemoBlock title='开关大小'>
                <DemoSize />
            </DemoBlock>
            <DemoBlock title='自定义开关大小'>
                <DemoRect />
            </DemoBlock>
            <DemoBlock title='自定义圆形按钮间距'>
                <DemoThumbGap />
            </DemoBlock>
        </Webview>
    );
};
