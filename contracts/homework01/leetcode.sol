// SPDX-License-Identifier: MIT 
pragma solidity 0.8.28;

contract LeetCode {
    // 反转字符串 (Reverse String)
    // 题目描述：反转一个字符串。输入 "abcde"，输出 "edcba"
    function reverseString(
        string memory str
    ) public pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        uint256 left = 0;
        uint256 right = strBytes.length - 1;
        while (left < right) {
            // 交换字符
            (strBytes[left], strBytes[right]) = (
                strBytes[right],
                strBytes[left]
            );
            left++;
            right--;
        }
        return string(strBytes);
    }

    /**
    罗马数字包含以下七种字符: I， V， X， L，C，D 和 M。

字符          数值
I             1
V             5
X             10
L             50
C             100
D             500
M             1000
例如， 罗马数字 2 写做 II ，即为两个并列的 1 。12 写做 XII ，即为 X + II 。 27 写做  XXVII, 即为 XX + V + II 。

通常情况下，罗马数字中小的数字在大的数字的右边。但也存在特例，例如 4 不写做 IIII，而是 IV。数字 1 在数字 5 的左边，所表示的数等于大数 5 减小数 1 得到的数值 4 。同样地，数字 9 表示为 IX。这个特殊的规则只适用于以下六种情况：

I 可以放在 V (5) 和 X (10) 的左边，来表示 4 和 9。
X 可以放在 L (50) 和 C (100) 的左边，来表示 40 和 90。 
C 可以放在 D (500) 和 M (1000) 的左边，来表示 400 和 900。
给定一个罗马数字，将其转换成整数。
     */
    function romanToInt(string memory s) public pure returns (uint256) {
        bytes memory sBytes = bytes(s);
        uint256 total = 0;
        uint256 prevInt = 0;
        for (uint256 i = 0; i < sBytes.length; i++) {
            uint256 currentValue = romanCharToInt(sBytes[i]);
            if (currentValue > prevInt) {
                total -= prevInt;
            } else {
                total += currentValue;
            }
            prevInt = currentValue;
        }

        return total;
    }

    function romanCharToInt(bytes1 char) internal pure returns (uint256) {
        if (char == "I") return 1;
        if (char == "V") return 5;
        if (char == "X") return 10;
        if (char == "L") return 50;
        if (char == "C") return 100;
        if (char == "D") return 500;
        if (char == "M") return 1000;
        return 0; // 无效字符
    }

    /**
     罗马数字是通过添加从最高到最低的小数位值的转换而形成的。将小数位值转换为罗马数字有以下规则：

如果该值不是以 4 或 9 开头，请选择可以从输入中减去的最大值的符号，将该符号附加到结果，减去其值，然后将其余部分转换为罗马数字。
如果该值以 4 或 9 开头，使用 减法形式，表示从以下符号中减去一个符号，例如 4 是 5 (V) 减 1 (I): IV ，9 是 10 (X) 减 1 (I)：IX。仅使用以下减法形式：4 (IV)，9 (IX)，40 (XL)，90 (XC)，400 (CD) 和 900 (CM)。
只有 10 的次方（I, X, C, M）最多可以连续附加 3 次以代表 10 的倍数。你不能多次附加 5 (V)，50 (L) 或 500 (D)。如果需要将符号附加4次，请使用 减法形式。
给定一个整数，将其转换为罗马数字。
      */
    function intToRoman(uint256 num) public pure returns (string memory) {
        string[13] memory symbols;
        symbols[0] = "M";
        symbols[1] = "CM";
        symbols[2] = "D";
        symbols[3] = "CD";
        symbols[4] = "C";
        symbols[5] = "XC";
        symbols[6] = "L";
        symbols[7] = "XL";
        symbols[8] = "X";
        symbols[9] = "IX";
        symbols[10] = "V";
        symbols[11] = "IV";
        symbols[12] = "I";

        uint256[13] memory values = [
            uint256(1000),
            uint256(900),
            uint256(500),
            uint256(400),
            uint256(100),
            uint256(90),
            uint256(50),
            uint256(40),
            uint256(10),
            uint256(9),
            uint256(5),
            uint256(4),
            uint256(1)
        ];

        bytes memory result;
        for (uint256 i = 0; i < symbols.length; i++) {
            while (num >= values[i]) {
                result = abi.encodePacked(result, bytes(symbols[i]));
                num -= values[i];
            }
        }

        return string(result);
    }

    /**
      合并两个有序数组 (Merge Sorted Array)
       */
    function mergeSortedArrays(
        uint256[] memory nums1,
        uint256 m,
        uint256[] memory nums2,
        uint256 n
    ) public pure returns (uint256[] memory) {
        uint256[] memory merged = new uint256[](m + n);
        uint256 i = 0; // nums1 index
        uint256 j = 0; // nums2 index
        uint256 k = 0; // merged index

        while (i < m && j < n) {
            if (nums1[i] < nums2[j]) {
                merged[k++] = nums1[i++];
            } else {
                merged[k++] = nums2[j++];
            }
        }

        while (i < m) {
            merged[k++] = nums1[i++];
        }

        while (j < n) {
            merged[k++] = nums2[i++];
        }

        return merged;
    }

    /**
       二分查找 (Binary Search)
        */
    function binarySearch(
        uint256[] memory nums,
        uint256 target
    ) public pure returns (int256) {
        int256 left = 0;
        int256 right = int256(nums.length) - 1;

        while (left <= right) {
            int256 mid = left + (right - left) / 2;
            if (nums[uint256(mid)] == target) {
                return mid;
            } else if (nums[uint256(mid)] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        return -1;
    }
}
