import React from 'react';
const LOADING_ICON = 'https://static.seeyouyima.com/webviewjs/images/load-more/loading.png';

export interface LoadMoreProps {
    /**是否分页结束 */
    isEnd?: boolean;
    /**是否正在下拉加载中 */
    loading?: boolean;
    /**是否加载出错 */
    isError?: boolean;
    /**底部tip样式 */
    style?: React.CSSProperties;
    /**加载中的自定义提示语 */
    loadingTip?: string | React.ReactNode;
    /**分页结束的提示语 */
    endTip?: string | React.ReactNode;
    /**网络是否可用 */
    netOk?: boolean;
    /**更新加载回调方法 */
    refresh?: () => void;
}

function LoadMore({
    style,
    isEnd = false,
    loading,
    loadingTip = '正在加载更多...',
    endTip = '暂无更多内容',
    isError,
    netOk,
    refresh,
}: LoadMoreProps) {
    const renderTip = () => {
        if (isError) {
            if (!netOk) {
                return <span>网络不见了，请检查网络</span>;
            }
            return (
                <span onClick={refresh}>
                    加载失败 <span className='my-load-more-refresh-text'>重新加载</span>
                </span>
            );
        }
        if (loading === true) {
            return loadingTip;
        }
        if (isEnd) {
            return endTip;
        }
        if (!netOk) {
            return <span>网络不见了，请检查网络</span>;
        }
        return '上拉加载更多';
    };

    return (
        <div className='my-load-more-tip' style={style}>
            {!isEnd && loading === true && (
                <img className='my-load-more-loading-icon' src={LOADING_ICON} />
            )}
            <span className='my-load-more-tip-text'>{renderTip()}</span>
        </div>
    );
}

export default LoadMore;
