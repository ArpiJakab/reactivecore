import {
	ADD_COMPONENT,
	REMOVE_COMPONENT,
	WATCH_COMPONENT,
	SET_QUERY,
	EXECUTE_QUERY,
	UPDATE_HITS,
	UPDATE_AGGS,
	SET_QUERY_OPTIONS,
	LOG_QUERY,
	SET_VALUE,
	CLEAR_VALUES
} from "../constants";

import { buildQuery, isEqual } from "../utils/helper";

export function addComponent(component) {
	return {
		type: ADD_COMPONENT,
		component
	};
}

export function removeComponent(component) {
	return {
		type: REMOVE_COMPONENT,
		component
	};
}

function updateWatchman(component, react) {
	return {
		type: WATCH_COMPONENT,
		component,
		react
	};
}

export function watchComponent(component, react) {
	return (dispatch, getState) => {
		dispatch(updateWatchman(component, react));

		const store = getState();
		const { queryObj, options } = buildQuery(component, store.dependencyTree, store.queryList, store.queryOptions);

		if ((queryObj && Object.keys(queryObj).length) ||
			(options && "aggs" in options)) {
			dispatch(executeQuery(component, queryObj, options));
		}
	}
}

export function setQuery(component, query) {
	return {
		type: SET_QUERY,
		component,
		query
	};
}

export function setQueryOptions(component, queryOptions) {
	return (dispatch, getState) => {
		dispatch(updateQueryOptions(component, queryOptions));

		const store = getState();
		const { queryObj, options } = buildQuery(component, store.dependencyTree, store.queryList, store.queryOptions);

		if ((queryObj && Object.keys(queryObj).length) ||
			(options && "aggs" in options)) {
			dispatch(executeQuery(component, queryObj, options));
		}
	}
}

function updateQueryOptions(component, options) {
	return {
		type: SET_QUERY_OPTIONS,
		component,
		options
	};
}

export function logQuery(component, query) {
	return {
		type: LOG_QUERY,
		component,
		query
	};
}

export function executeQuery(component, query, options = {}, appendToHits = false, onQueryChange) {
	return (dispatch, getState) => {
		const { appbaseRef, config, queryLog } = getState();
		let mainQuery = null;

		if (query) {
			mainQuery = {
				query
			}
		}

		const finalQuery = {
			...mainQuery,
			...options
		};

		if (!isEqual(finalQuery, queryLog[component])) {
			console.log("Executing for", component, finalQuery);
			if (onQueryChange) {
				onQueryChange(queryLog[component], finalQuery);
			}
			dispatch(logQuery(component, finalQuery));

			appbaseRef.search({
				type: config.type === "*" ? null : config.type,
				body: finalQuery
			})
				.on("data", response => {
					dispatch(updateHits(component, response.hits, appendToHits))

					if ("aggregations" in response) {
						dispatch(updateAggs(component, response.aggregations));
					}
				})
				.on("error", e => {
					console.log(e);
				});
		}
	}
}

export function updateHits(component, hits, append = false) {
	return {
		type: UPDATE_HITS,
		component,
		hits: hits.hits,
		total: hits.total,
		append
	}
}

export function updateAggs(component, aggregations) {
	return {
		type: UPDATE_AGGS,
		component,
		aggregations
	}
}

export function updateQuery(componentId, query, value, label = null, onQueryChange) {
	return (dispatch, getState) => {
		let queryToDispatch = query;
		if (query && query.query) {
			queryToDispatch = query.query;
		}
		// don't set filters for internal components
		if (!componentId.endsWith("__internal")) {
			dispatch(setValue(componentId, value, label));
		}
		dispatch(setQuery(componentId, queryToDispatch));

		const store = getState();
		const watchList = store.watchMan[componentId];

		if (Array.isArray(watchList)) {
			watchList.forEach(component => {
				const { queryObj, options } = buildQuery(component, store.dependencyTree, store.queryList, store.queryOptions);
				dispatch(executeQuery(component, queryObj, options, false, onQueryChange));
			});
		}
	}
}

export function loadMore(component, newOptions, append = true) {
	return (dispatch, getState) => {
		const store = getState();
		let { queryObj, options } = buildQuery(component, store.dependencyTree, store.queryList, store.queryOptions);

		if (!options) {
			options = {};
		}

		options = { ...options, ...newOptions };
		dispatch(executeQuery(component, queryObj, options, append));
	}
}

export function setValue(component, value, label) {
	return {
		type: SET_VALUE,
		component,
		value,
		label
	};
}

export function clearValues() {
	return {
		type: CLEAR_VALUES
	};
}
