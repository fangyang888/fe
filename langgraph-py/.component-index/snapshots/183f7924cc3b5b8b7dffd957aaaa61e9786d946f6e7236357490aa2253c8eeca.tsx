import React, { useCallback, useState } from 'react';
import { LoadMore } from '@meetyou/react-my';
import '../../../style/load-more.scss';
import { NavBlock } from '../../../../../../src/components';

const sleep = (duration: number) => new Promise(r => setTimeout(r, duration));

export default () => {
    const [config, setConfig] = useState<any>({
        error: {},
    });

    const refresh = useCallback(async () => {
        setConfig({
            error: {
                loading: true,
                isError: false,
            },
        });
        await sleep(2000);
        setConfig({
            error: {
                loading: false,
                isError: true,
            },
        });
    }, []);
    return (
        <div>
            <NavBlock title='基础样式'>
                <LoadMore netOk></LoadMore>
            </NavBlock>
            <NavBlock title='加载中的样式'>
                <LoadMore loading></LoadMore>
            </NavBlock>
            <NavBlock title='加载失败'>
                <LoadMore
                    loading={config.error.loading === true}
                    isError={config.error.isError !== false}
                    netOk
                    refresh={refresh}
                ></LoadMore>
            </NavBlock>
            <NavBlock title='网络不可用'>
                <LoadMore></LoadMore>
            </NavBlock>
            <NavBlock title='内嵌alertStatus样式'>
                <LoadMore loading></LoadMore>
            </NavBlock>
        </div>
    );
};
