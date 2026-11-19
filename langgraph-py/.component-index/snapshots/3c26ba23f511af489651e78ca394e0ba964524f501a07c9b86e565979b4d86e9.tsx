import React, { useImperativeHandle, useMemo } from 'react';
import { default as mergeClass } from 'classnames';
import { useLoadMore, LoadMoreFuncProps } from '@meetyou/react-hooks';
import StatusAlert, { ALERT_STATUS_MAP, StatusAlertProps } from '../status-alert';
import LoadMore, { LoadMoreProps } from '../load-more';

export interface LoadMoreLayoutParams {
    reload: (clearData?: boolean) => void;
    refresh: () => void;
}

export interface LoadMoreLayoutProps<T> {
    /** 是否显示底部下拉信息 */
    showBottomTip?: (
        curDataSource?: T[],
        pagination?: { page: number; page_size: number },
    ) => boolean;
    /**是否出现加载中【statusAlert】的样式 */
    showAlertLoading?: boolean;
    /**容器class */
    className?: string;
    /**参考statusAlert的入参文档 */
    statusAlertProps?: StatusAlertProps;
    /**列表项渲染 */
    renderItem: (item: T, index: number) => React.ReactNode;
    /**参考react-hooks中的useLoadMore的hook参数 */
    requestProps: LoadMoreFuncProps<T>;
    /**LoadMore组件参数 */
    tipProps?: Pick<LoadMoreProps, 'style' | 'endTip' | 'loadingTip'>;
    loadRef?: React.MutableRefObject<LoadMoreLayoutParams | null>;
}

function LoadMoreLayout<T>({
    tipProps,
    className,
    showAlertLoading,
    showBottomTip,
    statusAlertProps,
    renderItem,
    requestProps,
    loadRef,
}: LoadMoreLayoutProps<T>) {
    const { dataSource, pagination, reload, ...loadMoreTipProps } = useLoadMore(requestProps);
    const statusAlertMessage = useMemo(() => {
        return (
            {
                true: ALERT_STATUS_MAP.LOADING,
                error: loadMoreTipProps?.netOk
                    ? ALERT_STATUS_MAP.ERROR
                    : ALERT_STATUS_MAP.NO_NETWORK,
                false: ALERT_STATUS_MAP.NO_DATA,
            }[String(loadMoreTipProps?.loading)] || ALERT_STATUS_MAP.NO_DATA
        );
    }, [loadMoreTipProps?.loading, loadMoreTipProps?.netOk]);

    // todo...
    const showTip = useMemo(() => {
        if (showBottomTip) {
            return showBottomTip(dataSource, pagination);
        }
        // 少于两页的数据
        // if (dataSource.length <= pagination?.page_size && !!loadMoreTipProps?.isEnd) {
        //     return false;
        // }
        return true;
    }, [showBottomTip, dataSource, pagination]);

    const showStatusAlert = useMemo(() => {
        return showAlertLoading && loadMoreTipProps?.loading && pagination?.page === 1;
    }, [showAlertLoading, loadMoreTipProps?.loading, pagination?.page]);

    useImperativeHandle(loadRef, () => ({
        refresh: loadMoreTipProps?.refresh,
        reload: reload,
    }));

    return (
        <div className={mergeClass('my-load-more-layout', className)}>
            {/* 列表 */}
            <div
                className='my-load-more-content'
                style={showStatusAlert ? { visibility: 'hidden' } : undefined}
            >
                {dataSource?.map(renderItem)}
            </div>
            {/* 加载样式 */}
            {showStatusAlert && (
                <StatusAlert
                    size='small'
                    buttonProps={
                        loadMoreTipProps?.isError
                            ? { type: 'regular', plain: true, onClick: () => reload?.(true) }
                            : undefined
                    }
                    buttonText={loadMoreTipProps?.isError ? '重新加载' : undefined}
                    {...(statusAlertProps || {})}
                    status={statusAlertMessage}
                    className={mergeClass('my-load-more-status-alert', statusAlertProps?.className)}
                />
            )}
            {/* 底部下拉tip */}
            {showTip && <LoadMore {...(tipProps || {})} {...loadMoreTipProps} />}
        </div>
    );
}

export default LoadMoreLayout;
