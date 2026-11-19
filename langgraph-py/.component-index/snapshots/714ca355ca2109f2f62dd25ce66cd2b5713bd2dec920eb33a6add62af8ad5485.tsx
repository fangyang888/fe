import React, { useRef, useState } from 'react';
import { Button, Space, Switch } from 'antd';
import { LoadMoreLayout } from '@meetyou/react-my';
import '../../../style/load-more-layout.scss';
import '../../../style/load-more.scss';
import { LoadMoreLayoutParams } from '../LoadMoreLayout';

const sleep = (duration: number) => new Promise(r => setTimeout(r, duration));

const getList = async (
    params: { page?: number; page_size: number; last_id?: number },
    isPage?: boolean,
) => {
    await sleep(2000);

    if (isPage) {
        return {
            list: Array.from({ length: params.page_size || 10 }).map((_, index) => ({
                id: `第${params.page}页_第${index + 1}条`,
            })),
            total: 58,
        };
    } else {
        const last_id = params.last_id ? params.last_id + 1 : 1;
        return {
            list:
                last_id === 4
                    ? []
                    : Array.from({ length: params.page_size || 10 }).map((_, index) => ({
                          id: `第${last_id || 1}页_第${index + 1}条`,
                      })),
            last_id: last_id,
        };
    }
};
export default () => {
    const [checkValue, setCheckValue] = useState(true);
    const loadRef = useRef<LoadMoreLayoutParams>(null);

    return (
        <div style={{ paddingTop: 20, position: 'relative' }}>
            <div
                style={{
                    textAlign: 'center',
                    position: 'fixed',
                    top: 0,
                    width: '100%',
                    background: '#fff',
                    zIndex: 1,
                }}
            >
                <Space>
                    <span>分页加载类型：</span>
                    <Switch
                        checked={checkValue}
                        checkedChildren='page'
                        unCheckedChildren='lastId'
                        onChange={() => {
                            setCheckValue(!checkValue);
                            setTimeout(() => {
                                loadRef.current?.reload?.(true);
                            });
                        }}
                    />
                </Space>
            </div>
            <Button
                style={{ position: 'fixed', bottom: 24, right: 24 }}
                shape='circle'
                onClick={() => loadRef.current?.reload?.(true)}
            >
                <span style={{ fontSize: 12 }}>重置</span>
            </Button>
            <LoadMoreLayout
                loadRef={loadRef}
                requestProps={{
                    request: (params: any) => getList(params as any, checkValue),
                    netOk: true,
                    type: checkValue ? 'page' : 'lastId',
                }}
                renderItem={(item: any, i) => (
                    <div
                        key={i}
                        style={{
                            height: '60px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        {item.id}
                    </div>
                )}
            />
        </div>
    );
};
