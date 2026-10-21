import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminApi, FetchShopsParams } from '../../api/admin.js';
import { ShopSummary, PaginationMeta } from '../../types/admin.js';

export type ShopSortField = 'created_at' | 'name' | 'revenue' | 'orders';
export type SortOrder = 'asc' | 'desc';

export interface UseAdminShopListOptions {
    initialLimit?: number;
    initialStatus?: string;
    initialSortBy?: ShopSortField;
    initialSortOrder?: SortOrder;
    debounceMs?: number;
}

export interface UseAdminShopListReturn {
    // Data & status
    shops: ShopSummary[];
    pagination: PaginationMeta | null;
    isLoading: boolean;
    error: string | null;

    // Filters & pagination state
    page: number;
    limit: number;
    searchQuery: string;
    debouncedSearch: string;
    status: string;
    sortBy: ShopSortField;
    sortOrder: SortOrder;

    // Actions
    setPage: (page: number) => void;
    setSearchQuery: (query: string) => void;
    setStatus: (status: string) => void;
    setSort: (sortBy: ShopSortField, order?: SortOrder) => void;
    clearSearch: () => void;
    reload: () => void;
}

const ALLOWED_SORT_FIELDS: ShopSortField[] = ['created_at', 'name', 'revenue', 'orders'];
const ALLOWED_SORT_ORDERS: SortOrder[] = ['asc', 'desc'];

export function useAdminShopList(options: UseAdminShopListOptions = {}): UseAdminShopListReturn {
    const {
        initialLimit = 10,
        initialStatus = 'all',
        initialSortBy = 'created_at',
        initialSortOrder = 'desc',
        debounceMs = 300
    } = options;

    const [page, setPage] = useState<number>(1);
    const [limit] = useState<number>(initialLimit);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    const [status, setStatusState] = useState<string>(initialStatus);
    const [sortBy, setSortByState] = useState<ShopSortField>(initialSortBy);
    const [sortOrder, setSortOrderState] = useState<SortOrder>(initialSortOrder);

    const [shops, setShops] = useState<ShopSummary[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Concurrency control: Track request generation and AbortController
    const requestIdRef = useRef<number>(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    // 1. Debounce Search Input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery.trim());
        }, debounceMs);

        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery, debounceMs]);

    // 2. Filter changes reset to page 1
    const setStatus = useCallback((newStatus: string) => {
        setStatusState(newStatus);
        setPage(1);
    }, []);

    const setSort = useCallback((field: ShopSortField, explicitOrder?: SortOrder) => {
        if (!ALLOWED_SORT_FIELDS.includes(field)) {
            field = 'created_at';
        }

        setSortByState(field);
        if (explicitOrder && ALLOWED_SORT_ORDERS.includes(explicitOrder)) {
            setSortOrderState(explicitOrder);
        } else {
            // Toggle order if clicking the same field, default to desc for metrics, asc for name
            setSortOrderState(prevOrder => {
                if (field === sortBy) {
                    return prevOrder === 'asc' ? 'desc' : 'asc';
                }
                return field === 'name' ? 'asc' : 'desc';
            });
        }
        setPage(1);
    }, [sortBy]);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setDebouncedSearch('');
        setPage(1);
    }, []);

    // 3. Fetch data with cancellation & generation check
    const fetchShops = useCallback(async () => {
        // Abort previous in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;
        const currentRequestId = ++requestIdRef.current;

        setIsLoading(true);
        setError(null);

        try {
            const params: FetchShopsParams = {
                page,
                limit,
                search: debouncedSearch || undefined,
                status: status !== 'all' ? status : undefined,
                sortBy,
                order: sortOrder
            };

            const data = await AdminApi.getShops(params, controller.signal);

            // Drop stale response if another request was triggered
            if (currentRequestId !== requestIdRef.current) {
                return;
            }

            setShops(data.shops || []);
            setPagination(data.pagination || null);
            setError(null);
        } catch (err: any) {
            // Ignore intentional abort errors
            if (err?.name === 'AbortError' || controller.signal.aborted) {
                return;
            }

            // Drop stale error if another request is active
            if (currentRequestId !== requestIdRef.current) {
                return;
            }

            setError(err?.message || 'Không thể tải danh sách cơ sở quán. Vui lòng thử lại.');
            setShops([]); // Do not show stale data as current results
            setPagination(null);
        } finally {
            if (currentRequestId === requestIdRef.current) {
                setIsLoading(false);
            }
        }
    }, [page, limit, debouncedSearch, status, sortBy, sortOrder]);

    // Re-fetch on any query parameter change
    useEffect(() => {
        fetchShops();

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchShops]);

    // Reset page to 1 when debouncedSearch changes
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch]);

    return {
        shops,
        pagination,
        isLoading,
        error,
        page,
        limit,
        searchQuery,
        debouncedSearch,
        status,
        sortBy,
        sortOrder,
        setPage,
        setSearchQuery,
        setStatus,
        setSort,
        clearSearch,
        reload: fetchShops
    };
}
