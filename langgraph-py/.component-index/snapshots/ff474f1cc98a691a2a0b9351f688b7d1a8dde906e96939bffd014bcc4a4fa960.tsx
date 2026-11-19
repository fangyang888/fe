import React from 'react';
import { Webview, DemoBlock } from '@meetyou/react-packages';
import DemoStatus from './Status';
import DemoCustomTips from './CustomTips';
import DemoFull from './Full';
import DemoCustomButton from './CustomButton';
import '../../../style/legacy-status-alert.scss';

export default () => {
    return (
        <Webview title='LegacyStatusAlert'>
            <DemoBlock title='基本用法'>
                <DemoStatus />
            </DemoBlock>
            <DemoBlock title='自定义提示文案'>
                <DemoCustomTips />
            </DemoBlock>
            <DemoBlock title='Full 模式'>
                <DemoFull />
            </DemoBlock>
            <DemoBlock title='定义按钮'>
                <DemoCustomButton />
            </DemoBlock>
        </Webview>
    );
};
