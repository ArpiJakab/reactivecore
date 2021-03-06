import {
	ADD_COMPONENT,
	REMOVE_COMPONENT,
	WATCH_COMPONENT,
	SET_QUERY,
	UPDATE_HITS,
	UPDATE_AGGS,
	SET_QUERY_OPTIONS,
	LOG_QUERY,
	SET_VALUE,
	CLEAR_VALUES,
	SET_LOADING,
	SET_STREAMING,
	PUSH_TO_STREAM_HITS,
	SET_TIMESTAMP,
	SET_HEADERS,
	SET_MAP_DATA,
} from '../constants';

import { buildQuery, isEqual } from '../utils/helper';

export function addComponent(component) {
	return {
		type: ADD_COMPONENT,
		component,
	};
}

export function removeComponent(component) {
	return {
		type: REMOVE_COMPONENT,
		component,
	};
}

function updateWatchman(component, react) {
	return {
		type: WATCH_COMPONENT,
		component,
		react,
	};
}

export function setQuery(component, query) {
	return {
		type: SET_QUERY,
		component,
		query,
	};
}

function updateQueryOptions(component, options) {
	return {
		type: SET_QUERY_OPTIONS,
		component,
		options,
	};
}

export function updateAggs(component, aggregations) {
	return {
		type: UPDATE_AGGS,
		component,
		aggregations,
	};
}

export function logQuery(component, query) {
	return {
		type: LOG_QUERY,
		component,
		query,
	};
}

export function updateHits(component, hits, time, append = false) {
	return {
		type: UPDATE_HITS,
		component,
		hits: hits.hits,
		total: hits.total,
		time,
		append,
	};
}

function setLoading(component, isLoading) {
	return {
		type: SET_LOADING,
		component,
		isLoading,
	};
}

function pushToStreamHits(component, hit) {
	return {
		type: PUSH_TO_STREAM_HITS,
		component,
		hit,
	};
}

export function setStreaming(component, status = false, ref = null) {
	return {
		type: SET_STREAMING,
		component,
		status,
		ref,
	};
}

function setTimestamp(component, timestamp) {
	return {
		type: SET_TIMESTAMP,
		component,
		timestamp,
	};
}


export function executeQuery(component, query, options = {}, appendToHits = false, onQueryChange) {
	return (dispatch, getState) => {
		const {
			appbaseRef,
			config,
			queryLog,
			stream,
			headers,
			mapData,
		} = getState();
		let mainQuery = null;

		if (query) {
			if (
				component in Object.keys(mapData)
				&& mapData[component].mustExecute
				&& mapData[component].query
			) {
				// add geo-bound-query if mustExecute is true
				let currentQuery = query.bool.must;
				if (!Array.isArray(currentQuery)) {
					currentQuery = [currentQuery];
				}
				mainQuery = {
					query: {
						bool: {
							must: [
								...currentQuery,
								mapData[component].query,
							],
						},
					},
				};
			} else {
				mainQuery = {
					query,
				};
			}
		} else if (component in Object.keys(mapData) && mapData[component].query) {
			// add geo-bound-query if no query is present
			mainQuery = {
				query: {
					bool: {
						must: [
							{ match_all: {} },
							mapData[component].query,
						],
					},
				},
			};
		}

		const finalQuery = {
			...mainQuery,
			...options,
		};

		if (Object.keys(finalQuery).length && !isEqual(finalQuery, queryLog[component])) {
			// console.log('Executing for', component, finalQuery);
			if (onQueryChange) {
				onQueryChange(queryLog[component], finalQuery);
			}
			dispatch(logQuery(component, finalQuery));
			dispatch(setLoading(component, true));

			const handleResponse = (response) => {
				const { timestamp } = getState();
				if (timestamp[component] && timestamp[component] > response._timestamp) {
					return;
				}

				if (response.hits) {
					dispatch(setTimestamp(component, response._timestamp));
					dispatch(updateHits(component, response.hits, response.took, appendToHits));
					dispatch(setLoading(component, false));

					if ('aggregations' in response) {
						dispatch(updateAggs(component, response.aggregations));
					}
				} else if (response._id) {
					dispatch(pushToStreamHits(component, response));
				}
			};

			const handleError = (error) => {
				console.error(error);
				dispatch(setLoading(component, false));
			};

			if (stream[component] && stream[component].status) {
				if (stream[component].ref) {
					stream[component].ref.stop();
				}

				if (!finalQuery.query) {
					finalQuery.query = {
						match_all: {},
					};
				}

				const ref = appbaseRef.searchStream({
					type: config.type === '*' ? '' : config.type,
					body: finalQuery,
				})
					.on('data', handleResponse)
					.on('error', handleError);

				dispatch(setStreaming(component, true, ref));
			}

			appbaseRef.setHeaders(headers);
			appbaseRef.search({
				type: config.type === '*' ? '' : config.type,
				body: finalQuery,
				preference: component,
			})
				.on('data', handleResponse)
				.on('error', handleError);
		}
	};
}

export function watchComponent(component, react) {
	return (dispatch, getState) => {
		dispatch(updateWatchman(component, react));

		const store = getState();
		const { queryObj, options } = buildQuery(
			component,
			store.dependencyTree,
			store.queryList,
			store.queryOptions,
		);

		if ((queryObj && Object.keys(queryObj).length)
			|| (options && 'aggs' in options)) {
			dispatch(executeQuery(component, queryObj, options));
		}
	};
}

export function setQueryOptions(component, queryOptions, execute = true) {
	return (dispatch, getState) => {
		dispatch(updateQueryOptions(component, queryOptions));

		if (execute) {
			const store = getState();
			const { queryObj, options } = buildQuery(
				component,
				store.dependencyTree,
				store.queryList,
				store.queryOptions,
			);
			if (
				(queryObj && Object.keys(queryObj).length)
				|| (options && ('aggs' in options || 'sort' in options))
			) {
				dispatch(executeQuery(component, queryObj, options));
			}

			const watchList = store.watchMan[component];

			if (Array.isArray(watchList)) {
				watchList.forEach((subscriber) => {
					const { queryObj: queryObject, options: qOptions } = buildQuery(
						subscriber,
						store.dependencyTree,
						store.queryList,
						store.queryOptions,
					);
					dispatch(executeQuery(subscriber, queryObject, qOptions, false));
				});
			}
		}
	};
}

export function setValue(component, value, label, showFilter, URLParams) {
	return {
		type: SET_VALUE,
		component,
		value,
		label,
		showFilter,
		URLParams,
	};
}

export function updateQuery({
	componentId,
	query,
	value,
	label = null,
	showFilter = true,
	onQueryChange,
	URLParams = false,
}) {
	return (dispatch, getState) => {
		let queryToDispatch = query;
		if (query && query.query) {
			queryToDispatch = query.query;
		}
		// don't set filters for internal components
		if (!componentId.endsWith('__internal')) {
			dispatch(setValue(componentId, value, label, showFilter, URLParams));
		}
		dispatch(setQuery(componentId, queryToDispatch));

		const store = getState();
		const watchList = store.watchMan[componentId];

		if (Array.isArray(watchList)) {
			watchList.forEach((component) => {
				const { queryObj, options } = buildQuery(
					component,
					store.dependencyTree,
					store.queryList,
					store.queryOptions,
				);
				dispatch(executeQuery(component, queryObj, options, false, onQueryChange));
			});
		}
	};
}

export function loadMore(component, newOptions, append = true) {
	return (dispatch, getState) => {
		const store = getState();
		let { queryObj, options } = buildQuery( // eslint-disable-line
			component,
			store.dependencyTree,
			store.queryList,
			store.queryOptions,
		);

		if (!options) {
			options = {};
		}

		options = { ...options, ...newOptions };
		dispatch(executeQuery(component, queryObj, options, append));
	};
}

export function clearValues() {
	return {
		type: CLEAR_VALUES,
	};
}

export function setHeaders(headers) {
	return {
		type: SET_HEADERS,
		headers,
	};
}

function updateMapData(componentId, query, mustExecute) {
	return {
		type: SET_MAP_DATA,
		componentId,
		query,
		mustExecute,
	};
}

export function setMapData(componentId, query, mustExecute) {
	return (dispatch, getState) => {
		dispatch(updateMapData(componentId, query, mustExecute));

		const store = getState();
		const { queryObj, options } = buildQuery(
			componentId,
			store.dependencyTree,
			store.queryList,
			store.queryOptions,
		);

		dispatch(executeQuery(componentId, queryObj, options));
	};
}
