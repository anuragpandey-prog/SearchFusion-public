import { useState } from 'react';
import axios from 'axios';

export const useApiPost = (apiUrl) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const postData = async (requestData) => {
        setIsLoading(true);
        setError('');
        setData(null);
        try {
            const response = await axios.post(apiUrl, requestData);
            setData(response.data);
        } catch (err) {
            setError('Failed to fetch data. Please check the backend server or your request.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return { data, error, isLoading, postData };
};
