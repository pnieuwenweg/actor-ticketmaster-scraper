import { URL, URLSearchParams } from 'url';

export function buildFetchRequest({
    sortBy,
    countryCode, geoHash, distance,
    thisWeekendDate, dateFrom, dateTo, includeTBA, includeTBD,
},
classifications, page = 0, scrapedItems = 0) {
    const url = new URL(`https://www.ticketmaster.com/api/next/graphql?`);

    const variables = buildRequestVariables({
        sortBy,
        countryCode,
        geoHash,
        distance,
        thisWeekendDate,
        dateFrom,
        dateTo,
        includeTBA,
        includeTBD,
    }, classifications, page);

    const extensions = {
        persistedQuery: {
            version: 1,
            sha256Hash: '5664b981ff921ec078e3df377fd4623faaa6cd0aa2178e8bdfcba9b41303848b',
        },
    };

    const queryParams = {
        operationName: 'CategorySearch',
        variables: JSON.stringify(variables),
        extensions: JSON.stringify(extensions),
    };

    url.search = new URLSearchParams(queryParams);

    const request = {
        url: url.toString(),
        userData: { page, classifications, scrapedItems },
    };

    // Debug logging
    console.log(`Generated request for page ${page}:`, {
        page,
        scrapedItems,
        classificationsCount: classifications.length,
        url: request.url.substring(0, 200) + '...' // Truncate for readability
    });

    return request;
}

function buildRequestVariables({
    sortBy,
    countryCode, geoHash, distance,
    thisWeekendDate, dateFrom, dateTo, includeTBA, includeTBD,
}, classifications, page) {
    const { sort, asc } = getSortOptions(sortBy);
    const sortOrder = asc ? 'asc' : 'desc';

    const variables = {
        type: 'event',
        locale: 'en-us',
        localeStr: 'en-us',
        page,
        size: 200,
        sort: `${sort},${sortOrder}`,
        classificationId: classifications,
        lineupImages: true,
        withSeoEvents: true,
        geoHash,
        countryCode,
        radius: distance,
        unit: 'miles',
        includeTBA,
        includeTBD,
    };

    addDateVariable(variables, { thisWeekendDate, dateFrom, dateTo });

    console.log('Final request variables:', {
        ...variables,
        classificationId: `[${variables.classificationId.length} items]` // Don't log the full array
    });

    return variables;
}

function getSortOptions(sortBy) {
    const sortOptions = { sort: 'date', asc: true }; // sort by date in asc order by default

    if (sortBy === 'date' || sortBy === 'relevance') {
        sortOptions.sort = sortBy;
    } else if (sortBy) {
        const lowerCaseSort = sortBy.toLowerCase();

        if (lowerCaseSort.includes('asc')) {
            sortOptions.sort = lowerCaseSort.replace('asc', '');
        } else if (lowerCaseSort.includes('desc')) {
            sortOptions.sort = lowerCaseSort.replace('desc', '');
            sortOptions.asc = false;
        }
    }

    return sortOptions;
}

function addDateVariable(variables, { thisWeekendDate, dateFrom, dateTo }) {
    console.log('Date filter input:', { thisWeekendDate, dateFrom, dateTo });
    
    if (thisWeekendDate) {
        variables.localStartEndDateTime = getWeekendDatesString();
        console.log('Applied weekend filter:', variables.localStartEndDateTime);
    } else if (dateFrom && dateTo) {
        variables.localStartEndDateTime = getDateRangeString(dateFrom, dateTo);
        console.log('Applied date range filter:', variables.localStartEndDateTime);
    } else if (dateFrom) {
        // FIX: When only dateFrom is provided, automatically set an end date far in the future
        // This is necessary because Ticketmaster API requires BOTH start and end dates to filter properly
        validateDateFormat(dateFrom);
        const defaultEndDate = '2030-12-31'; // Far future date
        variables.localStartEndDateTime = getDateRangeString(dateFrom, defaultEndDate);
        console.log('Applied dateFrom filter with auto end date:', variables.localStartEndDateTime);
        console.log('NOTE: Auto-added end date (2030-12-31) because Ticketmaster requires both start and end dates');
    } else if (dateTo) {
        // When only dateTo is provided, start from current date
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        validateDateFormat(dateTo);
        variables.localStartEndDateTime = getDateRangeString(currentDate, dateTo);
        console.log('Applied dateTo filter with auto start date:', variables.localStartEndDateTime);
        console.log('NOTE: Auto-added start date (today) because Ticketmaster requires both start and end dates');
    } else {
        console.log('No date filter applied');
    }
}

function getWeekendDatesString() {
    const now = new Date();
    
    // Calculate days until Saturday (6) and Sunday (0)
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    let daysUntilSaturday, daysUntilSunday;
    
    if (currentDay === 0) { // It's Sunday
        daysUntilSaturday = 6; // Next Saturday
        daysUntilSunday = 0;   // Today
    } else if (currentDay === 6) { // It's Saturday
        daysUntilSaturday = 0; // Today
        daysUntilSunday = 1;   // Tomorrow
    } else { // Monday to Friday
        daysUntilSaturday = 6 - currentDay; // Days until this Saturday
        daysUntilSunday = 7 - currentDay;   // Days until this Sunday
    }
    
    const saturdayDate = new Date(now);
    saturdayDate.setDate(now.getDate() + daysUntilSaturday);
    
    const sundayDate = new Date(now);
    sundayDate.setDate(now.getDate() + daysUntilSunday);

    setDateFromHours(saturdayDate);
    setDateToHours(sundayDate);

    const result = `${convertDateToISOFormat(saturdayDate)},${convertDateToISOFormat(sundayDate)}`;
    console.log('Weekend calculation:', {
        currentDay,
        daysUntilSaturday,
        daysUntilSunday,
        saturdayDate: saturdayDate.toISOString(),
        sundayDate: sundayDate.toISOString(),
        result
    });
    
    return result;
}

function getDateRangeString(dateFrom, dateTo) {
    validateDateFormat(dateFrom);
    validateDateFormat(dateTo);

    const from = new Date(dateFrom);
    const to = new Date(dateTo);

    setDateFromHours(from);
    setDateToHours(to);

    return `${convertDateToISOFormat(from)},${convertDateToISOFormat(to)}`;
}

function validateDateFormat(dateFormat) {
    if (!Date.parse(dateFormat)) {
        throw new Error(`Invalid date format provided. Valid format is: YYYY-MM-DD. Format from input: ${dateFormat}.`);
    }
}

function setDateFromHours(date) {
    date.setUTCHours(0, 0, 0, 0);
}

function setDateToHours(date) {
    date.setUTCHours(23, 59, 59, 999);
}

function convertDateToISOFormat(date) {
    return date.toISOString().split('.')[0];
}
